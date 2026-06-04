import frappe
from frappe import _
import json
import datetime
from erpnext.accounts.doctype.bank_reconciliation_tool.bank_reconciliation_tool import create_payment_entry_bts, create_journal_entry_bts
from erpnext.accounts.party import get_party_account
from erpnext import get_default_cost_center
from erpnext.accounts.doctype.payment_entry.payment_entry import (
    get_outstanding_reference_documents,
    get_reference_details,
)
from erpnext.accounts.utils import get_account_currency
from erpnext import get_company_currency


def _expand_rows_with_payment_terms(data: list[dict]) -> list[dict]:
    """
    Ensure rows include payment_term when allocation based on payment terms is enabled.
    If a voucher has multiple outstanding terms, split it into multiple rows.
    """
    if not data:
        return data

    expanded = []
    for row in data:
        voucher_type = row.get("voucher_type")
        voucher_no = row.get("voucher_no")
        existing_term = row.get("payment_term")

        # If already term-split (or non-voucher row), keep as is.
        if not voucher_type or not voucher_no or existing_term:
            expanded.append(row)
            continue

        # Guard against doctypes/installs where payment_terms_template doesn't exist
        # on the parent table (out-of-sync schema, removed-by-custom-app, etc.).
        # `has_field` checks meta (JSON); the try/except catches the case where the
        # column is missing from the actual SQL table after a partial migration.
        if not frappe.get_meta(voucher_type).has_field("payment_terms_template"):
            expanded.append(row)
            continue

        try:
            template = frappe.db.get_value(voucher_type, voucher_no, "payment_terms_template")
        except Exception:
            expanded.append(row)
            continue
        if not template:
            expanded.append(row)
            continue

        allocate_by_terms = frappe.db.get_value(
            "Payment Terms Template",
            template,
            "allocate_payment_based_on_payment_terms",
        )
        if not allocate_by_terms:
            expanded.append(row)
            continue

        schedules = frappe.get_all(
            "Payment Schedule",
            filters={"parenttype": voucher_type, "parent": voucher_no},
            fields=["payment_term", "outstanding"],
            order_by="idx asc",
        )
        term_rows = [s for s in schedules if (s.get("payment_term") and float(s.get("outstanding") or 0) > 0)]
        if not term_rows:
            expanded.append(row)
            continue

        total_outstanding = float(row.get("outstanding_amount") or 0)
        for i, s in enumerate(term_rows):
            term_outstanding = float(s.get("outstanding") or 0)
            cloned = frappe._dict(row.copy())
            cloned["payment_term"] = s.get("payment_term")
            cloned["payment_term_outstanding"] = term_outstanding
            cloned["outstanding_amount"] = term_outstanding
            # Keep row totals consistent when user selects all split rows.
            cloned["allocated_amount"] = 0
            # Preserve original total on each row; only outstanding changes per term.
            if total_outstanding and i == 0:
                cloned["_original_outstanding_amount"] = total_outstanding
            expanded.append(cloned)

    return expanded

@frappe.whitelist()
def clear_clearing_date(voucher_type: str, voucher_name: str):
    """
        Clear the clearing date of a voucher
    """
    # using db_set to trigger notification
    payment_entry = frappe.get_doc(voucher_type, voucher_name)

    if payment_entry.has_permission("write"):
        payment_entry.db_set("clearance_date", None)


@frappe.whitelist()
def reconcile_vouchers(bank_transaction_name, vouchers, is_new_voucher: bool = False):
	 
    # updated clear date of all the vouchers based on the bank transaction
    vouchers = json.loads(vouchers)
    transaction = frappe.get_doc("Bank Transaction", bank_transaction_name)
    
    # Add the vouchers with zero allocation. Save() will perform the allocations and clearance
    # We are overriding the default behavior of the method to set the reconciliation type
    if 0.0 >= transaction.unallocated_amount:
        frappe.throw(_("Bank Transaction {0} is already fully reconciled").format(transaction.name))
    
    for voucher in vouchers:
        transaction.append(
            "payment_entries",
            {
                "payment_document": voucher["payment_doctype"],
                "payment_entry": voucher["payment_name"],
                "allocated_amount": 0.0,  # Temporary
                "reconciliation_type": "Voucher Created" if is_new_voucher else "Matched",
            },
        )
    transaction.validate_duplicate_references()
    transaction.allocate_payment_entries()
    transaction.update_allocated_amount()
    transaction.set_status()
    transaction.save()
    
    return transaction

@frappe.whitelist()
def unreconcile_transaction(transaction_name: str):
    """
        Unreconcile a transaction

        If the individual entries in the bank transaction are matched, just remove the payment entries
        Else, cancel the individual entries
    """
    transaction = frappe.get_doc("Bank Transaction", transaction_name)

    vouchers_to_cancel = []

    for entry in transaction.payment_entries:
        if entry.reconciliation_type == "Voucher Created":
            vouchers_to_cancel.append({
                "doctype": entry.payment_document,
                "name": entry.payment_entry,
            })
            
    transaction.remove_payment_entries()

    for voucher in vouchers_to_cancel:
        frappe.get_doc(voucher["doctype"], voucher["name"]).cancel()

@frappe.whitelist(methods=["POST"])
def create_bulk_internal_transfer(bank_transaction_names: list, 
                                  bank_account: str):
    """
        Create an internal transfer for multiple bank transactions
    """
    for bank_transaction_name in bank_transaction_names:

        bank_transaction = frappe.db.get_value("Bank Transaction", bank_transaction_name, ["name", "withdrawal", "bank_account", "date", "reference_number", "description"], as_dict=True)

        transaction_account = frappe.get_cached_value("Bank Account", bank_transaction.bank_account, "account")

        is_withdrawal = bank_transaction.withdrawal > 0.0

        if is_withdrawal:
            paid_from = transaction_account
            paid_to = bank_account
        else:
            paid_from = bank_account
            paid_to = transaction_account
        
        reference_no = (bank_transaction.reference_number or bank_transaction.description or '')[:140]
        
        create_internal_transfer(bank_transaction_name=bank_transaction.name,
                                 posting_date=bank_transaction.date,
                                 reference_date=bank_transaction.date,
                                 reference_no=reference_no,
                                 paid_from=paid_from,
                                 paid_to=paid_to,)

@frappe.whitelist()
def create_internal_transfer(bank_transaction_name: str, 
                             posting_date: str | datetime.date, 
                             reference_date: str | datetime.date, 
                             reference_no: str, 
                             paid_from: str, 
                             paid_to: str,
                             custom_remarks: bool = False,
                             remarks: str = None,
                             mirror_transaction_name: str = None,
                             dimensions: dict = None):
    """
    Create an internal transfer payment entry
    """

    bank_transaction = frappe.get_doc("Bank Transaction", bank_transaction_name)

    bank_account = frappe.get_cached_value("Bank Account", bank_transaction.bank_account, "account")
    company = frappe.get_cached_value("Account", bank_account, "company")

    is_withdrawal = bank_transaction.withdrawal > 0.0

    pe = frappe.new_doc("Payment Entry")

    pe.company = company
    pe.payment_type = "Internal Transfer"
    pe.posting_date = posting_date
    pe.reference_date = reference_date
    pe.reference_no = reference_no
    pe.custom_remarks = custom_remarks
    pe.paid_amount = bank_transaction.unallocated_amount
    pe.received_amount = bank_transaction.unallocated_amount

    # TODO: Support multi-currency transactions
    pe.target_exchange_rate = 1.0

    if custom_remarks:
        pe.remarks = remarks
    
    if dimensions:
        pe.update(dimensions)

    if is_withdrawal:
         pe.paid_to = paid_to
         pe.paid_from = bank_account
    else:
         pe.paid_from = paid_from
         pe.paid_to = bank_account
    
    pe.insert()
    pe.submit()

    vouchers = json.dumps(
		[
			{
				"payment_doctype": "Payment Entry",
				"payment_name": pe.name,
				"amount": bank_transaction.unallocated_amount,
			}
		]
	)

    transaction_id = reconcile_vouchers(bank_transaction_name, vouchers, is_new_voucher=True)

    if mirror_transaction_name:
        # Reconcile the mirror transaction
        reconcile_vouchers(mirror_transaction_name, vouchers, is_new_voucher=False)

    return transaction_id

@frappe.whitelist(methods=['POST'])
def create_bulk_bank_entry_and_reconcile(bank_transactions: list, 
                                         account: str):
    """
     Create bank entries for all transactions and reconcile them
    """
    for bank_transaction in bank_transactions:
        transactions_details = frappe.db.get_value("Bank Transaction", bank_transaction, ["name", "deposit", "withdrawal", "bank_account", "currency", "unallocated_amount", "date", "reference_number", "description"], as_dict=True)

        is_credit_card = frappe.get_cached_value("Bank Account", transactions_details.bank_account, "is_credit_card")

        # Check Number will be limited to 140 characters
        cheque_no = (transactions_details.reference_number or transactions_details.description or '')[:140]

        create_bank_entry_and_reconcile(bank_transaction_name=bank_transaction,
                                        cheque_date=transactions_details.date,
                                        posting_date=transactions_details.date,
                                        cheque_no=cheque_no,
                                        user_remark=transactions_details.description,
                                        entries=[{
                                            "account": account,
                                            "amount": transactions_details.unallocated_amount,
                                        }],
                                        voucher_type=("Credit Card Entry" if is_credit_card else "Bank Entry"))

@frappe.whitelist(methods=['POST'])
def create_bank_entry_and_reconcile(bank_transaction_name: str, 
                                    cheque_date: str | datetime.date,
                                    posting_date: str | datetime.date,
                                    cheque_no: str,
                                    entries: list,
                                    user_remark: str = None,
                                    voucher_type: str = "Bank Entry",
                                    dimensions: dict = None):
    """
        Create a bank entry and reconcile it with the bank transaction
    """
    # Create a new journal entry based on the bank transaction
    bank_transaction = frappe.db.get_values(
        "Bank Transaction",
        bank_transaction_name,
        fieldname=["name", "deposit", "withdrawal", "bank_account", "currency", "unallocated_amount"],
        as_dict=True,
    )[0]

    bank_account = frappe.get_cached_value("Bank Account", bank_transaction.bank_account, "account")
    company = frappe.get_cached_value("Account", bank_account, "company")

    default_cost_center = get_default_cost_center(company)

    bank_entry = frappe.get_doc({
        "doctype": "Journal Entry",
        "voucher_type": voucher_type,
        "company": company,
        "cheque_date": cheque_date,
        "posting_date": posting_date,
        "cheque_no": cheque_no,
        "user_remark": user_remark,
    })

    # Compute accounts for JE 
    is_withdrawal = bank_transaction.withdrawal > 0.0

    if is_withdrawal:
        bank_entry.append("accounts", {
            "account": bank_account,
            "bank_account": bank_transaction.bank_account,
            "credit_in_account_currency": bank_transaction.unallocated_amount,
            "credit": bank_transaction.unallocated_amount,
            "debit_in_account_currency": 0,
            "debit": 0,
        })
    else:
        bank_entry.append("accounts", {
            "account": bank_account,
            "bank_account": bank_transaction.bank_account,
            "debit_in_account_currency": bank_transaction.unallocated_amount,
            "debit": bank_transaction.unallocated_amount,
            "credit_in_account_currency": 0,
            "debit": 0,
        })
    
    if not dimensions:
        dimensions = {}
    
    for entry in entries:
        # Check if this account is a Income or Expense Account
        # If it is, and no cost center is added, select the company default cost center
        cost_center = dimensions.get("cost_center")

        if not cost_center:
            report_type = frappe.get_cached_value("Account", entry["account"], "report_type")
            if report_type == "Profit and Loss":
                # Cost center is required
                cost_center = default_cost_center
        
        credit = entry["amount"] if not is_withdrawal else 0
        debit = entry["amount"] if is_withdrawal else 0
        bank_entry.append("accounts", {
            "account": entry["account"],
            # TODO: Multi currency support
            "debit_in_account_currency": debit,
            "credit_in_account_currency": credit,
            "debit": debit,
            "credit": credit,
            "cost_center": cost_center,
            "party_type": entry.get("party_type") if entry.get("party") else None,
            "party": entry.get("party"),
            "user_remark": entry.get("user_remark"),
            # Optional reference link — empty strings are normalized to None so the
            # row doesn't look reconciled-to-nothing.
            "reference_type": entry.get("reference_type") or None,
            "reference_name": entry.get("reference_name") or None,
            **dimensions,
        })

    bank_entry.insert()
    bank_entry.submit()

    if bank_transaction.deposit > 0.0:
        paid_amount = bank_transaction.deposit
    else:
        paid_amount = bank_transaction.withdrawal

    return reconcile_vouchers(bank_transaction_name, json.dumps([{
        "payment_doctype": "Journal Entry",
        "payment_name": bank_entry.name,
        "amount": paid_amount,
    }]), is_new_voucher=True)

@frappe.whitelist(methods=['POST'])
def create_bulk_payment_entry_and_reconcile(bank_transaction_names: list, 
                                            party_type: str, 
                                            party: str, 
                                            account: str,
                                            mode_of_payment: str | None = None):
    """
        Create a payment entry and reconcile it with the bank transaction
    """

    for bank_transaction_name in bank_transaction_names:
        bank_transaction = frappe.db.get_value("Bank Transaction", bank_transaction_name, ["name", "deposit", "withdrawal", "bank_account", "currency", "unallocated_amount", "date", "reference_number", "description"], as_dict=True)

        transaction_account = frappe.get_cached_value("Bank Account", bank_transaction.bank_account, "account")

        is_withdrawal = bank_transaction.withdrawal > 0.0

        if is_withdrawal:
            paid_from = transaction_account
            paid_to = account
        else:
            paid_from = account
            paid_to = transaction_account
        
        payment_entry_doc = frappe.get_doc({
            "doctype": "Payment Entry",
            "payment_type": "Pay" if is_withdrawal else "Receive",
            "bank_account": bank_transaction.bank_account,
            "company": bank_transaction.company,
            "mode_of_payment": mode_of_payment,
            "party_type": party_type,
            "party": party,
            "paid_from": paid_from,
            "paid_to": paid_to,
            "paid_amount": bank_transaction.unallocated_amount,
            "base_paid_amount": bank_transaction.unallocated_amount,
            "received_amount": bank_transaction.unallocated_amount,
            "base_received_amount": bank_transaction.unallocated_amount,
            "target_exchange_rate": 1,
            "source_exchange_rate": 1,
            "reference_date": bank_transaction.date,
            "posting_date": bank_transaction.date,
            "reference_no": (bank_transaction.reference_number or bank_transaction.description or '')[:140],
        })

        payment_entry_doc.insert()
        payment_entry_doc.submit()

        reconcile_vouchers(bank_transaction_name, json.dumps([{
            "payment_doctype": "Payment Entry",
            "payment_name": payment_entry_doc.name,
            "amount": payment_entry_doc.paid_amount,
        }]), is_new_voucher=True)

    
@frappe.whitelist(methods=['POST'])
def create_payment_entry_and_reconcile(bank_transaction_name: str, 
                                       payment_entry_doc: dict):
    """
        Create a payment entry and reconcile it with the bank transaction
    """
    payment_entry = frappe.get_doc({
        **payment_entry_doc,
        "doctype": "Payment Entry",
    })
    payment_entry.insert()
    payment_entry.submit()
    return reconcile_vouchers(bank_transaction_name, json.dumps([{
        "payment_doctype": "Payment Entry",
        "payment_name": payment_entry.name,
        "amount": payment_entry.paid_amount,
    }]), is_new_voucher=True)


@frappe.whitelist(methods=['GET'])
def get_account_defaults(account: str):
    """
        Get the default cost center and write off account for an account
    """
    company, report_type = frappe.db.get_value("Account", account, ["company", "report_type"])

    return get_default_cost_center(company) if report_type == "Profit and Loss" else  ""


@frappe.whitelist(methods=["GET"])
def get_party_details(company: str, party_type: str, party: str):

    if not frappe.db.exists(party_type, party):
        frappe.throw(_("{0} {1} does not exist").format(party_type, party))

    party_account = get_party_account(party_type, party, company)
    _party_name = "title" if party_type == "Shareholder" else party_type.lower() + "_name"
    party_name = frappe.db.get_value(party_type, party, _party_name)

    return {
        "party_account": party_account,
        "party_name": party_name,
    }

@frappe.whitelist(methods=["GET"])
def search_for_transfer_transaction(transaction_id: str):
    """
    When users try to create a transfer, we could help them by searching for the mirror transaction.

    So for a withdrawal of 1000, we could search for a deposit of 1000 on the same date.

    If the mirror transaction is found, we return the bank account and account details.
    """
    company, withdrawal, deposit, date, bank_account = frappe.db.get_value("Bank Transaction", transaction_id, ["company", "withdrawal", "deposit", "date", "bank_account"])

    
    days = frappe.db.get_single_value("Mint Settings", "transfer_match_days")

    if not days:
        days = 4

    min_date = frappe.utils.add_days(date, -days)
    max_date = frappe.utils.add_days(date, days)
    mirror_tx = frappe.db.get_list("Bank Transaction", filters={
        "company": company,
        "date": ["between", [min_date, max_date]],
        "withdrawal": deposit,
        "bank_account": ["!=", bank_account],
        "deposit": withdrawal,
        "docstatus": 1,
        "status": "Unreconciled",
    }, fields=["name", "bank_account", "reference_number", "date", "description", "withdrawal", "deposit", "currency"])

    if len(mirror_tx) == 1:
        return {
            "name": mirror_tx[0].name,
            "reference_number": mirror_tx[0].reference_number,
            "description": mirror_tx[0].description,
            "currency": mirror_tx[0].currency,
            "withdrawal": mirror_tx[0].withdrawal,
            "deposit": mirror_tx[0].deposit,
            "date": mirror_tx[0].date,
            "bank_account": mirror_tx[0].bank_account,
            "account": frappe.get_cached_value("Bank Account", mirror_tx[0].bank_account, "account"),
        }

    return None


@frappe.whitelist(methods=["GET"])
def get_outstanding_references_for_record_payment(args: dict | str):
    """
    Return outstanding references for Record Payment popup with optional doctype filtering.
    Includes:
    - Standard outstanding references from ERPNext (Invoices / Orders)
    - Quotation rows for Customer when requested
    """
    if isinstance(args, str):
        args = json.loads(args)

    args = args or {}
    selected_doctypes = args.get("selected_doctypes") or []
    if isinstance(selected_doctypes, str):
        try:
            selected_doctypes = json.loads(selected_doctypes)
        except Exception:
            selected_doctypes = [selected_doctypes]

    base_args = dict(args)
    base_args.pop("selected_doctypes", None)
    include_quotations = bool(base_args.pop("include_quotations", True))
    base_args["get_outstanding_invoices"] = True
    base_args["get_orders_to_be_billed"] = True

    data = get_outstanding_reference_documents(base_args) or []

    if include_quotations and base_args.get("party_type") == "Customer" and base_args.get("party"):
        company = base_args.get("company")
        party = base_args.get("party")
        party_account = base_args.get("party_account")
        party_account_currency = (
            get_account_currency(party_account)
            if party_account
            else get_company_currency(company)
        )

        quotation_filters = {
            "docstatus": 1,
            "quotation_to": "Customer",
            "party_name": party,
            # Only genuinely open quotations belong here. Exclude:
            #  - Ordered: already converted to a Sales Order (shown separately)
            #  - Expired / Lost: no longer collectible
            "status": ["not in", ["Ordered", "Expired", "Lost"]],
        }
        if company:
            quotation_filters["company"] = company

        quotations = frappe.get_all(
            "Quotation",
            filters=quotation_filters,
            fields=["name", "transaction_date", "valid_till", "grand_total"],
            order_by="transaction_date desc, modified desc",
        )

        for q in quotations:
            try:
                details = get_reference_details(
                    "Quotation",
                    q.name,
                    party_account_currency,
                    base_args.get("party_type"),
                    party,
                )
            except Exception:
                continue

            outstanding_amount = float(details.get("outstanding_amount") or 0)
            if outstanding_amount <= 0:
                continue

            data.append(
                frappe._dict(
                    {
                        "voucher_type": "Quotation",
                        "voucher_no": q.name,
                        "bill_no": None,
                        "posting_date": q.transaction_date,
                        "due_date": q.valid_till or q.transaction_date,
                        "invoice_amount": float(details.get("total_amount") or q.grand_total or 0),
                        "outstanding_amount": outstanding_amount,
                        "payment_term": None,
                        "payment_term_outstanding": None,
                        "account": details.get("account"),
                        "allocated_amount": 0,
                    }
                )
            )

    data = _expand_rows_with_payment_terms(data)

    if selected_doctypes:
        allowed = set(selected_doctypes)
        data = [row for row in data if row.get("voucher_type") in allowed]

    data.sort(
        key=lambda row: (
            row.get("posting_date") or "",
            row.get("voucher_no") or "",
        ),
        reverse=True,
    )
    return data
