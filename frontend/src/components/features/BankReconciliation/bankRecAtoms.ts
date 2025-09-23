import { BankAccount } from "@/types/Accounts/BankAccount";
import { getDatesForTimePeriod } from "@/lib/date";
import { atom } from "jotai";
import { atomFamily, atomWithStorage } from "jotai/utils";
import { UnreconciledTransaction } from "./utils";

export interface SelectedBank extends Pick<BankAccount, 'name' | 'bank' | 'is_credit_card' | 'company' | 'account_name' | 'bank_account_no' | 'account' | 'account_type' | 'integration_id' | 'is_default' | 'last_integration_date'> {
    logo?: string,
    account_currency?: string
}
export const selectedBankAccountAtom = atom<SelectedBank | null>(null)

export const bankRecDateAtom = atomWithStorage<{ fromDate: string, toDate: string }>("mint-bank-rec-date", {
    fromDate: getDatesForTimePeriod('This Month').fromDate,
    toDate: getDatesForTimePeriod('This Month').toDate
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const bankRecClosingBalanceAtom = atomFamily((_id: string) => {
    return atom<{ value: number, stringValue: string | number | undefined }>({
        value: 0,
        stringValue: '0.00'
    })
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const bankRecSelectedTransactionAtom = atomFamily((_id: string) => {
    return atom<UnreconciledTransaction[]>([])
})

/** Action Modals */
export const bankRecTransferModalAtom = atom(false)
export const bankRecRecordPaymentModalAtom = atom(false)
export const bankRecRecordJournalEntryModalAtom = atom(false)

export const bankRecUnreconcileModalAtom = atom<string>('')

export const bankRecMatchFilters = atomWithStorage<string[]>('mint-bank-rec-match-filters', ['payment_entry', 'journal_entry', 'sales_invoice', 'exact_amount_match'])

// Sorting atoms for invoice matching
export type SortField = 'outstanding_amount' | 'posting_date' | 'customer_name' | 'grand_total' | 'due_date'
export type SortOrder = 'asc' | 'desc'

export const bankRecInvoiceSortFieldAtom = atomWithStorage<SortField>('mint-bank-rec-invoice-sort-field', 'outstanding_amount')
export const bankRecInvoiceSortOrderAtom = atomWithStorage<SortOrder>('mint-bank-rec-invoice-sort-order', 'asc')