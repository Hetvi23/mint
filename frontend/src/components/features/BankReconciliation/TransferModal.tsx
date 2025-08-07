import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { bankRecSelectedTransactionAtom, bankRecTransferModalAtom, bankRecUnreconcileModalAtom, SelectedBank, selectedBankAccountAtom } from './bankRecAtoms'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogClose, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import _ from '@/lib/translate'
import { UnreconciledTransaction, useGetBankAccounts, useGetRuleForTransaction, useRefreshUnreconciledTransactions } from './utils'
import { Button } from '@/components/ui/button'
import SelectedTransactionDetails from './SelectedTransactionDetails'
import { PaymentEntry } from '@/types/Accounts/PaymentEntry'
import { useForm, useFormContext, useWatch } from 'react-hook-form'
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk'
import { toast } from 'sonner'
import ErrorBanner from '@/components/ui/error-banner'
import { H4 } from '@/components/ui/typography'
import { cn } from '@/lib/utils'
import { ArrowRight, Banknote, Landmark, BadgeCheck, Calendar, ArrowUpRight, ArrowDownRight, CheckIcon, CheckCircle } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Form } from '@/components/ui/form'
import { AccountFormField, DataField, DateField, SmallTextField } from '@/components/ui/form-elements'
import SelectedTransactionsTable from './SelectedTransactionsTable'
import { useCurrentCompany } from '@/hooks/useCurrentCompany'
import { formatDate } from '@/lib/date'
import { useMemo } from 'react'
import { BANK_LOGOS } from './logos'
import { formatCurrency } from '@/lib/numbers'

const TransferModal = () => {

    const [isOpen, setIsOpen] = useAtom(bankRecTransferModalAtom)

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className='min-w-7xl'>
                <DialogHeader>
                    <DialogTitle>{_("Transfer")}</DialogTitle>
                    <DialogDescription>
                        {_("Record an internal transfer to another bank/credit card/cash account.")}
                    </DialogDescription>
                </DialogHeader>
                <TransferModalContent />
            </DialogContent>
        </Dialog>
    )
}

const TransferModalContent = () => {

    const selectedBankAccount = useAtomValue(selectedBankAccountAtom)

    const selectedTransaction = useAtomValue(bankRecSelectedTransactionAtom(selectedBankAccount?.name ?? ''))

    if (!selectedTransaction || !selectedBankAccount) {
        return <div className='p-4'>
            <span className='text-center'>No transaction selected</span>
        </div>
    }

    if (selectedTransaction.length === 1) {
        return <InternalTransferForm
            selectedBankAccount={selectedBankAccount}
            selectedTransaction={selectedTransaction[0]} />
    }

    return <BulkInternalTransferForm transactions={selectedTransaction} />

}

const BulkInternalTransferForm = ({ transactions }: { transactions: UnreconciledTransaction[] }) => {

    const form = useForm<{
        bank_account: string
    }>()

    const setIsOpen = useSetAtom(bankRecTransferModalAtom)

    const { call: createPaymentEntry, loading, error } = useFrappePostCall('mint.apis.bank_reconciliation.create_bulk_internal_transfer')

    const onReconcile = useRefreshUnreconciledTransactions()

    const onSubmit = (data: { bank_account: string }) => {

        createPaymentEntry({
            bank_transaction_names: transactions.map((transaction) => transaction.name),
            bank_account: data.bank_account
        }).then(() => {
            toast.success(_("Transfer Recorded"), {
                duration: 4000,
                closeButton: true,
            })
            onReconcile(transactions[transactions.length - 1])
            setIsOpen(false)
        })

    }

    const onAccountChange = (account: string) => {
        form.setValue('bank_account', account)
    }

    const selectedAccount = useWatch({ control: form.control, name: 'bank_account' })

    const currentCompany = useCurrentCompany()

    const company = transactions && transactions.length > 0 ? transactions[0].company : (currentCompany ?? '')

    return <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className='flex flex-col gap-4'>

                {error && <ErrorBanner error={error} />}

                <SelectedTransactionsTable />

                <BankOrCashPicker company={company} bankAccount={transactions[0].bank_account ?? ''} onAccountChange={onAccountChange} selectedAccount={selectedAccount} />

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant={'outline'} disabled={loading}>{_("Cancel")}</Button>
                    </DialogClose>
                    <Button type='submit' disabled={loading}>{_("Transfer")}</Button>
                </DialogFooter>
            </div>
        </form>

    </Form>
}

interface InternalTransferFormFields extends PaymentEntry {
    mirror_transaction_name?: string
}

const InternalTransferForm = ({ selectedBankAccount, selectedTransaction }: { selectedBankAccount: SelectedBank, selectedTransaction: UnreconciledTransaction }) => {


    const setIsOpen = useSetAtom(bankRecTransferModalAtom)

    const onClose = () => {
        setIsOpen(false)
    }

    const { data: rule } = useGetRuleForTransaction(selectedTransaction)

    const isWithdrawal = (selectedTransaction.withdrawal && selectedTransaction.withdrawal > 0) ? true : false

    const form = useForm<InternalTransferFormFields>({
        defaultValues: {
            payment_type: 'Internal Transfer',
            company: selectedTransaction?.company,
            // If the transaction is a withdrawal, set the paid from to the selected bank account
            paid_from: isWithdrawal ? selectedBankAccount.account : (rule?.account ?? ''),
            // If the transaction is a deposit, set the paid to to the selected bank account
            paid_to: !isWithdrawal ? selectedBankAccount.account : (rule?.account ?? ''),
            // Set the amount to the amount of the selected transaction
            paid_amount: selectedTransaction.unallocated_amount,
            received_amount: selectedTransaction.unallocated_amount,
            reference_date: selectedTransaction.date,
            posting_date: selectedTransaction.date,
            reference_no: (selectedTransaction.reference_number || selectedTransaction.description || '').slice(0, 140),
        }
    })

    const onReconcile = useRefreshUnreconciledTransactions()

    const { call: createPaymentEntry, loading, error } = useFrappePostCall('mint.apis.bank_reconciliation.create_internal_transfer')

    const setBankRecUnreconcileModalAtom = useSetAtom(bankRecUnreconcileModalAtom)

    const onSubmit = (data: InternalTransferFormFields) => {

        createPaymentEntry({
            bank_transaction_name: selectedTransaction.name,
            ...data,
            custom_remarks: data.remarks ? true : false,
            // Pass this to reconcile both at the same time
            mirror_transaction_name: data.mirror_transaction_name
        }).then(() => {
            toast.success(_("Transfer Recorded"), {
                duration: 4000,
                closeButton: true,
                action: {
                    label: _("Undo"),
                    onClick: () => setBankRecUnreconcileModalAtom(selectedTransaction.name)
                },
                actionButtonStyle: {
                    backgroundColor: "rgb(0, 138, 46)"
                }
            })
            onReconcile(selectedTransaction)
            onClose()
        })
    }

    const onAccountChange = (account: string, is_mirror: boolean = false) => {
        //If the transaction is a withdrawal, set the paid to to the selected account - since this is the account where the money is deposited into
        if (selectedTransaction.withdrawal && selectedTransaction.withdrawal > 0) {
            form.setValue('paid_to', account)
        } else {
            form.setValue('paid_from', account)
        }

        if (!is_mirror) {
            // Reset the mirror transaction name
            form.setValue('mirror_transaction_name', '')
        }
    }

    const selectedAccount = useWatch({ control: form.control, name: (selectedTransaction.deposit && selectedTransaction.deposit > 0) ? 'paid_from' : 'paid_to' })

    return <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className='flex flex-col gap-4'>
                {error && <ErrorBanner error={error} />}
                <div className='grid grid-cols-2 gap-4'>
                    <SelectedTransactionDetails transaction={selectedTransaction} />

                    <div className='flex flex-col gap-4'>
                        <div className='grid grid-cols-2 gap-4'>
                            <DateField
                                name='posting_date'
                                label={"Posting Date"}
                                isRequired
                                inputProps={{ autoFocus: false }}
                            />
                            <DateField
                                name='reference_date'
                                label={"Reference Date"}
                                isRequired
                                inputProps={{ autoFocus: false }}
                            />
                        </div>
                        <DataField name='reference_no' label={"Reference No"} isRequired inputProps={{ autoFocus: false }} />
                    </div>
                </div>

                <div className='flex flex-col gap-2'>
                    <H4 className='text-base'>{isWithdrawal ? _('Transferred to') : _('Transferred from')}</H4>
                    <RecommendedTransferAccount transaction={selectedTransaction} onAccountChange={onAccountChange} />
                    <BankOrCashPicker company={selectedTransaction.company ?? ''} bankAccount={selectedTransaction.bank_account ?? ''} onAccountChange={onAccountChange} selectedAccount={selectedAccount} />
                </div>
                <div className='flex flex-col gap-2 py-2'>
                    <div className='flex items-end justify-between gap-4'>
                        <div className='flex-1'>
                            <AccountFormField
                                name="paid_from"
                                label="Paid From"
                                account_type={['Bank', 'Cash']}
                                readOnly={isWithdrawal}
                                filterFunction={(account) => account.name !== selectedBankAccount.account}
                                isRequired
                            />
                        </div>

                        <div className='pb-2'>
                            <ArrowRight />
                        </div>
                        <div className='flex-1'>
                            <AccountFormField
                                name="paid_to"
                                label="Paid To"
                                account_type={['Bank', 'Cash']}
                                isRequired
                                readOnly={!isWithdrawal}
                                filterFunction={(account) => account.name !== selectedBankAccount.account}
                            />
                        </div>
                    </div>
                </div>
                <Separator />
                <div className='flex flex-col gap-2'>
                    <div className='grid grid-cols-2 gap-4'>


                        <SmallTextField
                            name='remarks'
                            label={"Custom Remarks"}
                            formDescription={"This will be auto-populated if not set."}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant={'outline'} disabled={loading}>{_("Cancel")}</Button>
                    </DialogClose>
                    <Button type='submit' disabled={loading}>{_("Transfer")}</Button>
                </DialogFooter>
            </div>
        </form>
    </Form>
}


const BankOrCashPicker = ({ bankAccount, onAccountChange, selectedAccount, company }: { selectedAccount: string, bankAccount: string, onAccountChange: (account: string) => void, company: string }) => {

    const { banks } = useGetBankAccounts(undefined, (bank) => bank.name !== bankAccount)

    return <div className='grid grid-cols-4 gap-4'>
        {banks.map((bank) => (
            <div
                className={cn('border p-2 rounded-md flex items-center gap-2 cursor-pointer outline-[0.5px] transition-all duration-200',
                    selectedAccount === bank.account ? 'border-blue-500 bg-blue-50 outline-blue-500 hover:bg-blue-100/70' : 'border-gray-200 outline-gray-200 hover:bg-gray-50'
                )}
                role='button'
                key={bank.account}
                onClick={() => onAccountChange(bank.account ?? '')}
            >
                {bank.logo ?
                    <img
                        src={`/assets/mint/mint/${bank.logo}`}
                        alt={bank.bank || ''}
                        className='w-12 h-12 object-contain'
                    /> : <div className='flex items-center justify-center h-10 w-10'>
                        <Landmark size='24px' />
                    </div>
                }
                <div className='flex flex-col gap-1'>
                    <span className='font-semibold text-sm'>{bank.account_name} {bank.bank_account_no && <span className='text-xs text-muted-foreground'>({bank.bank_account_no})</span>}</span>
                    <span className='text-xs text-muted-foreground'>{bank.account}</span>
                </div>
            </div>
        ))}
        <CashPicker company={company ?? ''} selectedAccount={selectedAccount} setSelectedAccount={onAccountChange} />
    </div>

}

const CashPicker = ({ company, selectedAccount, setSelectedAccount }: { company: string, selectedAccount: string, setSelectedAccount: (account: string) => void }) => {

    const { data } = useFrappeGetCall('frappe.client.get_value', {
        doctype: 'Company',
        filters: company,
        fieldname: 'default_cash_account'
    }, undefined, {
        revalidateOnFocus: false,
        revalidateIfStale: false,
    })

    const account = data?.message?.default_cash_account

    if (account) {
        return <div className={cn('border p-2 rounded-md flex items-center gap-2 cursor-pointer outline-[0.5px] transition-all duration-200',
            selectedAccount === account ? 'border-blue-500 bg-blue-50 outline-blue-500 hover:bg-blue-100/70' : 'border-gray-200 outline-gray-200 hover:bg-gray-50'
        )}
            role='button'
            onClick={() => setSelectedAccount(account ?? '')}
        >
            <div className='flex items-center justify-center h-10 w-10'>
                <Banknote size='24px' />
            </div>
            <div className='flex flex-col gap-1'>
                <span className='font-semibold text-sm'>Cash</span>
                <span className='text-xs text-muted-foreground'>{data?.message?.default_cash_account}</span>
            </div>
        </div>
    }

    return null
}


const RecommendedTransferAccount = ({ transaction, onAccountChange }: { transaction: UnreconciledTransaction, onAccountChange: (account: string, is_mirror: boolean) => void }) => {

    const { setValue, watch } = useFormContext<InternalTransferFormFields>()

    const mirrorTransactionName = watch('mirror_transaction_name')
    const paid_from = watch('paid_from')
    const paid_to = watch('paid_to')

    const { data } = useFrappeGetCall('mint.apis.bank_reconciliation.search_for_transfer_transaction', {
        transaction_id: transaction.name
    }, undefined, {
        revalidateOnFocus: false,
        revalidateIfStale: false,
    })

    // Get bank accounts to find the logo
    const { banks } = useGetBankAccounts()

    const bankLogo = useMemo(() => {
        if (data?.message?.bank_account && banks) {
            const bankAccount = banks.find(bank => bank.name === data.message.bank_account)
            if (bankAccount?.bank) {
                return BANK_LOGOS.find((logo) =>
                    logo.keywords.some((keyword) =>
                        bankAccount.bank?.toLowerCase().includes(keyword.toLowerCase())
                    )
                )
            }
        }
        return null
    }, [data?.message?.bank_account, banks])

    const selectTransaction = () => {
        if (data?.message) {
            setValue('mirror_transaction_name', data.message.name)
            onAccountChange(data.message.account, true)
        }
    }

    if (data?.message) {

        const isWithdrawal = data.message.withdrawal && data.message.withdrawal > 0

        const amount = isWithdrawal ? data.message.withdrawal : data.message.deposit
        const currency = data.message.currency

        const isAccountSelected = isWithdrawal ? paid_from === data.message.account : paid_to === data.message.account

        const isSuggested = mirrorTransactionName === data?.message?.name && isAccountSelected

        return (<div className='pb-2'>
            <div className={cn("flex justify-between items-start gap-3 p-3 border rounded-lg shadow-sm",
                isSuggested ? "border-green-200 bg-green-50/30" : "border-purple-200 bg-purple-50/30")}>
                <div className='px-1'>
                    <div className='flex flex-col gap-3'>
                        <div className={cn("flex items-center gap-2 shrink-0",
                            isSuggested ? "text-green-700" : "text-purple-700"
                        )}>
                            <BadgeCheck className="w-4 h-4" />
                            <span className="text-sm font-medium">{_("Suggested Transfer to {0}", [data.message.account])}</span>
                        </div>
                        <div className='flex flex-col gap-1'>
                            <span className='text-sm'>{_("The system found a mirror transaction ({0}) in another account with the same amount and date.", [data.message.name])}</span>
                            <span className='text-sm'>{_("Accepting the suggestion will reconcile both transactions.")}</span>
                        </div>

                        <div className='flex flex-col gap-1.5'>
                            <div className='flex items-center gap-1'>
                                <Calendar size='16px' />
                                <span className='text-sm'>{formatDate(data.message.date, 'Do MMM YYYY')}</span>
                            </div>
                            <span className='text-sm line-clamp-1' title={data.message.description}>{data.message.description}</span>
                        </div>
                    </div>
                </div>
                <div className='flex flex-col items-end justify-between gap-2 h-full w-[30%]'>
                    <div className="flex items-center gap-2">
                        {bankLogo ? (
                            <img
                                src={`/assets/mint/mint/${bankLogo.logo}`}
                                alt={bankLogo.keywords.join(', ') || ''}
                                className="h-8 max-w-24 object-contain"
                            />
                        ) : (
                            <Landmark className={cn("w-8 h-8", isSuggested ? "text-green-600" : "text-purple-600")} />
                        )}
                    </div>
                    <div className='flex gap-1'>
                        <div className={cn('flex items-center gap-1 text-right px-0 justify-end py-1 rounded-sm',
                            isWithdrawal ? 'text-destructive' : 'text-green-600'
                        )}>
                            {isWithdrawal ? <ArrowUpRight className="w-5 h-5 text-destructive" /> : <ArrowDownRight className="w-5 h-5 text-green-600" />}
                            <span className='text-sm font-semibold uppercase'>{isWithdrawal ? _('Transferred Out') : _('Received')}</span>
                        </div>
                    </div>
                    <span className='font-semibold font-mono text-lg text-right pr-0.5'>{formatCurrency(amount, currency)}</span>
                    <div>
                        <Button
                            onClick={selectTransaction}
                            className={cn("text-white hover:scale-[1.02] transition-all duration-200 font-medium",
                                isSuggested ? "bg-green-600 hover:bg-green-700 border-green-600" : "bg-purple-600 hover:bg-purple-700 border-purple-600"
                            )}
                            size="sm"
                            type='button'
                        >
                            {isSuggested ? <CheckCircle className="w-4 h-4 mr-2" /> : <CheckIcon className="w-4 h-4 mr-2" />}
                            {isSuggested ? _("Accepted") : _("Use Suggestion")}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
        )
    }

    return null
}

export default TransferModal