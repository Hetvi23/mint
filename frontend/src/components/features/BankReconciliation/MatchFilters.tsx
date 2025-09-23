import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import _ from '@/lib/translate'
import { Settings, ArrowUpDown } from 'lucide-react'
import { bankRecMatchFilters, bankRecInvoiceSortFieldAtom, bankRecInvoiceSortOrderAtom, SortField, SortOrder } from './bankRecAtoms'
import { useAtom, useAtomValue } from 'jotai'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEffect } from 'react'

const MatchFilters = () => {
    const [matchFilters] = useAtom(bankRecMatchFilters)
    const [sortField, setSortField] = useAtom(bankRecInvoiceSortFieldAtom)
    const [sortOrder, setSortOrder] = useAtom(bankRecInvoiceSortOrderAtom)
    
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
            <PopoverContent className="w-80">
                <div className="flex flex-col gap-4">
                    {/* Invoice Sorting Controls */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <ArrowUpDown className="h-4 w-4 text-gray-600" />
                            <span className="text-sm font-medium text-gray-700">Sort Invoices by:</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select value={sortField} onValueChange={(value: SortField) => setSortField(value)}>
                                <SelectTrigger className="w-40 h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="outstanding_amount">Outstanding Amount</SelectItem>
                                    <SelectItem value="posting_date">Posting Date</SelectItem>
                                    <SelectItem value="customer_name">Customer Name</SelectItem>
                                    <SelectItem value="grand_total">Total Amount</SelectItem>
                                    <SelectItem value="due_date">Due Date</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={sortOrder} onValueChange={(value: SortOrder) => setSortOrder(value)}>
                                <SelectTrigger className="w-32 h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="asc">Ascending</SelectItem>
                                    <SelectItem value="desc">Descending</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    
                    <Separator />
                    
                    <ToggleSwitch label="Exact Amount Match" id="exact_amount_match" />
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