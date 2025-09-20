import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import _ from '@/lib/translate'
import { Settings } from 'lucide-react'
import { bankRecMatchFilters } from './bankRecAtoms'
import { useAtom } from 'jotai'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useEffect } from 'react'

const MatchFilters = () => {
    const [matchFilters] = useAtom(bankRecMatchFilters)
    
    useEffect(() => {
        console.log('MatchFilters component mounted')
        console.log('Current match filters:', matchFilters)
    }, [matchFilters])

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
                    <ToggleSwitch label="Show Only Exact Amount" id="exact_match" />
                    <Separator />
                    <ToggleSwitch label="Payment Entry" id="payment_entry" />
                    <ToggleSwitch label="Journal Entry" id="journal_entry" />
                    <ToggleSwitch label="Purchase Invoice" id="purchase_invoice" />
                    <ToggleSwitch label="Sales Invoice" id="sales_invoice" />
                    <ToggleSwitch label="Expense Claim" id="expense_claim" />
                    <ToggleSwitch label="Bank Transaction" id="bank_transaction" />
                    <ToggleSwitch label="Invoice Matching" id="invoice_matching" />
                </div>
            </PopoverContent>
        </Popover>
    )
}

const ToggleSwitch = ({ label, id }: { label: string, id: string }) => {

    const [matchFilters, setMatchFilters] = useAtom(bankRecMatchFilters)

    return <div className="flex items-center space-x-2">
        <Switch id={id} checked={matchFilters.includes(id)} onCheckedChange={(checked) => {
            console.log(`Toggle ${label} (${id}) changed to:`, checked)
            if (checked) {
                setMatchFilters([...matchFilters, id])
                console.log(`Added ${id} to match filters. New filters:`, [...matchFilters, id])
            } else {
                setMatchFilters(matchFilters.filter(filter => filter !== id))
                console.log(`Removed ${id} from match filters. New filters:`, matchFilters.filter(filter => filter !== id))
            }
        }} />
        <Label htmlFor={id}>{label}</Label>
    </div>
}

export default MatchFilters