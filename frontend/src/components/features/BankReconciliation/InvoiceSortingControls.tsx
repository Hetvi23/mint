import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowUpDown } from 'lucide-react'
import { bankRecInvoiceSortFieldAtom, bankRecInvoiceSortOrderAtom, SortField, SortOrder } from './bankRecAtoms'
import { useAtom } from 'jotai'
import { bankRecMatchFilters } from './bankRecAtoms'
import { useAtomValue } from 'jotai'

const InvoiceSortingControls = () => {
    const [sortField, setSortField] = useAtom(bankRecInvoiceSortFieldAtom)
    const [sortOrder, setSortOrder] = useAtom(bankRecInvoiceSortOrderAtom)
    const matchFilters = useAtomValue(bankRecMatchFilters)

    // Only show sorting controls when invoice matching is enabled
    if (!matchFilters.includes('invoice_matching')) {
        return null
    }

    return (
        <div className="flex items-center gap-2 bg-yellow-100 px-3 py-2 rounded-lg border-2 border-yellow-400">
            <ArrowUpDown className="h-4 w-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">Sort:</span>
            
            <Select value={sortField} onValueChange={(value: SortField) => setSortField(value)}>
                <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="outstanding_amount">Outstanding</SelectItem>
                    <SelectItem value="posting_date">Date</SelectItem>
                    <SelectItem value="customer_name">Customer</SelectItem>
                    <SelectItem value="grand_total">Amount</SelectItem>
                    <SelectItem value="due_date">Due Date</SelectItem>
                </SelectContent>
            </Select>

            <Select value={sortOrder} onValueChange={(value: SortOrder) => setSortOrder(value)}>
                <SelectTrigger className="w-24 h-8">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="asc">↑</SelectItem>
                    <SelectItem value="desc">↓</SelectItem>
                </SelectContent>
            </Select>
        </div>
    )
}

export default InvoiceSortingControls
