import frappe


def execute(filters=None):
	filters = filters or {}
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{
			"label": "Payment Entry",
			"fieldname": "payment_entry",
			"fieldtype": "Link",
			"options": "Payment Entry",
			"width": 170,
		},
		{"label": "Posting Date", "fieldname": "posting_date", "fieldtype": "Date", "width": 110},
		{"label": "Company", "fieldname": "company", "fieldtype": "Link", "options": "Company", "width": 180},
		{
			"label": "Payment Type",
			"fieldname": "payment_type",
			"fieldtype": "Data",
			"width": 110,
		},
		{
			"label": "Party Type",
			"fieldname": "party_type",
			"fieldtype": "Data",
			"width": 120,
		},
		{"label": "Party", "fieldname": "party", "fieldtype": "Dynamic Link", "options": "party_type", "width": 170},
		{"label": "Party Name", "fieldname": "party_name", "fieldtype": "Data", "width": 180},
		{"label": "Paid Amount", "fieldname": "paid_amount", "fieldtype": "Currency", "width": 130},
		{"label": "Received Amount", "fieldname": "received_amount", "fieldtype": "Currency", "width": 130},
		{"label": "Paid From", "fieldname": "paid_from", "fieldtype": "Link", "options": "Account", "width": 180},
		{"label": "Paid To", "fieldname": "paid_to", "fieldtype": "Link", "options": "Account", "width": 180},
		{"label": "Mode of Payment", "fieldname": "mode_of_payment", "fieldtype": "Link", "options": "Mode of Payment", "width": 150},
		{"label": "Reference No", "fieldname": "reference_no", "fieldtype": "Data", "width": 170},
		{"label": "Status", "fieldname": "status", "fieldtype": "Data", "width": 130},
	]


def get_data(filters):
	conditions = ["pe.docstatus = 1", "bt_link.payment_entry IS NULL"]
	values = {}

	if filters.get("company"):
		conditions.append("pe.company = %(company)s")
		values["company"] = filters.get("company")

	if filters.get("payment_type"):
		conditions.append("pe.payment_type = %(payment_type)s")
		values["payment_type"] = filters.get("payment_type")

	if filters.get("party_type"):
		conditions.append("pe.party_type = %(party_type)s")
		values["party_type"] = filters.get("party_type")

	if filters.get("party"):
		conditions.append("pe.party = %(party)s")
		values["party"] = filters.get("party")

	if filters.get("from_date"):
		conditions.append("pe.posting_date >= %(from_date)s")
		values["from_date"] = filters.get("from_date")

	if filters.get("to_date"):
		conditions.append("pe.posting_date <= %(to_date)s")
		values["to_date"] = filters.get("to_date")

	where_clause = " AND ".join(conditions)

	return frappe.db.sql(
		f"""
		SELECT
			pe.name AS payment_entry,
			pe.posting_date,
			pe.company,
			pe.payment_type,
			pe.party_type,
			pe.party,
			pe.party_name,
			pe.paid_amount,
			pe.received_amount,
			pe.paid_from,
			pe.paid_to,
			pe.mode_of_payment,
			pe.reference_no,
			pe.status
		FROM `tabPayment Entry` pe
		LEFT JOIN (
			SELECT DISTINCT btp.payment_entry
			FROM `tabBank Transaction Payments` btp
			INNER JOIN `tabBank Transaction` bt
				ON bt.name = btp.parent
				AND bt.docstatus = 1
			WHERE
				btp.parenttype = 'Bank Transaction'
				AND btp.payment_document = 'Payment Entry'
				AND IFNULL(btp.payment_entry, '') != ''
		) bt_link ON bt_link.payment_entry = pe.name
		WHERE {where_clause}
		ORDER BY pe.posting_date DESC, pe.modified DESC
		""",
		values=values,
		as_dict=True,
	)
