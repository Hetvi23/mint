import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import _ from '@/lib/translate'
import { Settings } from 'lucide-react'
import { bankRecMatchFilters, bankRecSelectedTransactionAtom, selectedBankAccountAtom } from './bankRecAtoms'
import { useAtom, useAtomValue } from 'jotai'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useEffect } from 'react'
import { UnreconciledTransaction, useIsTransactionWithdrawal } from './utils'

const MatchFilters = () => {
    const [matchFilters, setMatchFilters] = useAtom(bankRecMatchFilters)
    const selectedBank = useAtomValue(selectedBankAccountAtom)
    const selectedTransactions = useAtomValue(bankRecSelectedTransactionAtom(selectedBank?.name || ''))
    
    // Get the first selected transaction to determine if it's a withdrawal
    const selectedTransaction = selectedTransactions[0]
    const { isWithdrawal } = selectedTransaction ? useIsTransactionWithdrawal(selectedTransaction) : { isWithdrawal: false }
    
    useEffect(() => {
        console.log('MatchFilters component mounted')
        console.log('Current match filters:', matchFilters)
        console.log('Selected transaction:', selectedTransaction?.name)
        console.log('Is withdrawal:', isWithdrawal)
    }, [matchFilters, selectedTransaction, isWithdrawal])

    // Auto-disable sales invoice toggle for withdrawal transactions
    useEffect(() => {
        if (selectedTransaction && isWithdrawal && matchFilters.includes('sales_invoice')) {
            console.log('Auto-disabling sales invoice toggle for withdrawal transaction')
            setMatchFilters(prev => prev.filter(filter => filter !== 'sales_invoice'))
        }
    }, [selectedTransaction, isWithdrawal, setMatchFilters])

    return (
        <Popover>
            <Tooltip>
                <PopoverTrigger asChild>
                    <TooltipTrigger asChild>
                        <Button 
                            size='sm' 
                            variant='outline' 
                            aria-label={_("Configure match filters for vouchers")}
                            onClick={() => console.log('Gear icon clicked - opening match filters')}
                        >
                            <Settings />
                        </Button>
                    </TooltipTrigger>
                </PopoverTrigger>
                <TooltipContent>
                    {_("Configure match filters for vouchers")}
                </TooltipContent>
            </Tooltip>
            <PopoverContent>
                <div className="flex flex-col gap-4">
                    <ToggleSwitch label="Exact Amount Match" id="exact_amount_match" />
                    <Separator />
                    <ToggleSwitch label="Payment Entry" id="payment_entry" />
                    <ToggleSwitch label="Journal Entry" id="journal_entry" />
                    <ToggleSwitch label="Purchase Invoice" id="purchase_invoice" />
                    <ToggleSwitch 
                        label="Sales Invoice" 
                        id="sales_invoice" 
                        disabled={isWithdrawal}
                        disabledReason={isWithdrawal ? "Sales invoices are for incoming payments, not withdrawals" : undefined}
                    />
                    <ToggleSwitch label="Expense Claim" id="expense_claim" />
                    <ToggleSwitch label="Bank Transaction" id="bank_transaction" />
                    <ToggleSwitch label="Invoice Matching" id="invoice_matching" />
                </div>
            </PopoverContent>
        </Popover>
    )
}

const ToggleSwitch = ({ 
    label, 
    id, 
    disabled = false, 
    disabledReason 
}: { 
    label: string, 
    id: string, 
    disabled?: boolean, 
    disabledReason?: string 
}) => {

    const [matchFilters, setMatchFilters] = useAtom(bankRecMatchFilters)

    const handleToggleChange = (checked: boolean) => {
        if (disabled) return
        
        console.log(`Toggle ${label} (${id}) changed to:`, checked)
        if (checked) {
            setMatchFilters([...matchFilters, id])
            console.log(`Added ${id} to match filters. New filters:`, [...matchFilters, id])
        } else {
            setMatchFilters(matchFilters.filter(filter => filter !== id))
            console.log(`Removed ${id} from match filters. New filters:`, matchFilters.filter(filter => filter !== id))
        }
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex items-center space-x-2">
                    <Switch 
                        id={id} 
                        checked={matchFilters.includes(id)} 
                        onCheckedChange={handleToggleChange}
                        disabled={disabled}
                    />
                    <Label 
                        htmlFor={id}
                        className={disabled ? "text-muted-foreground" : ""}
                    >
                        {label}
                    </Label>
                </div>
            </TooltipTrigger>
            {disabled && disabledReason && (
                <TooltipContent>
                    {disabledReason}
                </TooltipContent>
            )}
        </Tooltip>
    )
}

export default MatchFilters