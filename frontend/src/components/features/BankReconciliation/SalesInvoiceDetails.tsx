import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileText, User, Calendar, DollarSign, Search, ExternalLink } from "lucide-react"
import { formatCurrency } from "@/lib/numbers"
import { formatDate } from "@/lib/date"
import { UnreconciledTransaction, useIsTransactionWithdrawal } from "./utils"
import { bankRecMatchFilters, bankRecRecordPaymentModalAtom, bankRecInvoiceSortFieldAtom, bankRecInvoiceSortOrderAtom, bankRecRoundOffValueAtom } from "./bankRecAtoms"
import { useAtomValue, useSetAtom } from "jotai"
import _ from "@/lib/translate"
import { useCurrentCompany } from '@/hooks/useCurrentCompany'

interface SalesInvoice {
    name: string
    customer: string
    posting_date: string
    grand_total: number
    status: string
    outstanding_amount?: number
    customer_name?: string
    due_date?: string
    currency?: string
}

interface SalesInvoiceDetailsProps {
    transaction: UnreconciledTransaction
}

const SalesInvoiceDetails: React.FC<SalesInvoiceDetailsProps> = ({ transaction }) => {
    const [isLoading, setIsLoading] = useState(false)
    const [invoices, setInvoices] = useState<SalesInvoice[]>([])
    const [error, setError] = useState<string | null>(null)
    const [filteredInvoices, setFilteredInvoices] = useState<SalesInvoice[]>([])

    const { amount } = useIsTransactionWithdrawal(transaction)
    const matchFilters = useAtomValue(bankRecMatchFilters)
    const sortField = useAtomValue(bankRecInvoiceSortFieldAtom)
    const sortOrder = useAtomValue(bankRecInvoiceSortOrderAtom)
    const roundOffValue = useAtomValue(bankRecRoundOffValueAtom)
    const setRecordPaymentModalOpen = useSetAtom(bankRecRecordPaymentModalAtom)
    const currentCompany = useCurrentCompany()

    useEffect(() => {
        if (transaction && amount) {
            console.log('SalesInvoiceDetails component mounted for transaction:', transaction.name, 'Amount:', amount)
            console.log('Transaction details:', {
                name: transaction.name,
                description: transaction.description,
                amount: amount,
                date: transaction.date
            })
            fetchMatchingInvoices()
        }
    }, [transaction, amount])

    useEffect(() => {
        console.log('SalesInvoiceDetails render state:', {
            isLoading,
            error,
            invoicesCount: invoices.length,
            filteredInvoicesCount: filteredInvoices.length,
            sortField,
            sortOrder
        })
    }, [isLoading, error, invoices.length, filteredInvoices.length, sortField, sortOrder])

    useEffect(() => {
        if (invoices.length > 0) {
            console.log('Filters changed, re-filtering invoices')
            filterAndSortInvoices(invoices)
        }
    }, [matchFilters, amount, sortField, sortOrder, roundOffValue])

    const filterAndSortInvoices = (invoiceList: SalesInvoice[]) => {
        console.log('Filtering and sorting invoices:', invoiceList.length)
        console.log('Current filters:', matchFilters)
        console.log('Current sort field:', sortField, 'sort order:', sortOrder)
        
        let filtered = [...invoiceList]
        
        // Apply exact amount matching filter
        if (matchFilters.includes('exact_amount_match')) {
            console.log('Applying exact amount match filter for amount:', amount)
            filtered = filtered.filter(invoice => {
                const invoiceAmount = invoice.outstanding_amount || invoice.grand_total
                return amount ? invoiceAmount === amount : false
            })
            console.log('After exact amount filter:', filtered.length)
        } else {
            // Apply rounded off value filter (current behavior)
            console.log('Applying rounded off value filter for amount:', amount, 'with round off value:', roundOffValue)
            filtered = filtered.filter(invoice => {
                const invoiceAmount = invoice.outstanding_amount || invoice.grand_total
                // Round to nearest roundOffValue for comparison
                const roundedAmount = amount ? Math.round(amount / roundOffValue) * roundOffValue : 0
                const roundedInvoiceAmount = Math.round(invoiceAmount / roundOffValue) * roundOffValue
                console.log('Rounding comparison:', {
                    invoice: invoice.name,
                    invoiceAmount,
                    roundedInvoiceAmount,
                    transactionAmount: amount,
                    roundedAmount,
                    roundOffValue,
                    match: roundedInvoiceAmount === roundedAmount
                })
                return roundedInvoiceAmount === roundedAmount
            })
            console.log('After rounded off filter:', filtered.length)
        }
        
        // Filter outstanding amounts above paid amount
        filtered = filtered.filter(invoice => {
            const outstandingAmount = invoice.outstanding_amount || invoice.grand_total
            return amount ? outstandingAmount >= amount : true
        })
        console.log('After outstanding amount filter (>= paid amount):', filtered.length)
        
        // Sort by selected field and order
        filtered.sort((a, b) => {
            let valueA: any, valueB: any
            
            switch (sortField) {
                case 'outstanding_amount':
                    valueA = a.outstanding_amount || a.grand_total
                    valueB = b.outstanding_amount || b.grand_total
                    break
                case 'posting_date':
                    valueA = new Date(a.posting_date).getTime()
                    valueB = new Date(b.posting_date).getTime()
                    console.log('Sorting by posting_date:', {
                        invoiceA: a.name,
                        postingDateA: a.posting_date,
                        valueA,
                        invoiceB: b.name,
                        postingDateB: b.posting_date,
                        valueB
                    })
                    break
                case 'customer_name':
                    valueA = (a.customer_name || a.customer || '').toLowerCase()
                    valueB = (b.customer_name || b.customer || '').toLowerCase()
                    break
                case 'grand_total':
                    valueA = a.grand_total
                    valueB = b.grand_total
                    break
                case 'due_date':
                    valueA = a.due_date ? new Date(a.due_date).getTime() : 0
                    valueB = b.due_date ? new Date(b.due_date).getTime() : 0
                    break
                default:
                    valueA = a.outstanding_amount || a.grand_total
                    valueB = b.outstanding_amount || b.grand_total
            }
            
            if (sortField === 'customer_name') {
                return sortOrder === 'asc' 
                    ? valueA.localeCompare(valueB)
                    : valueB.localeCompare(valueA)
            } else {
                return sortOrder === 'asc' 
                    ? valueA - valueB
                    : valueB - valueA
            }
        })
        console.log(`After sorting by ${sortField} (${sortOrder}):`, filtered.length)
        
        setFilteredInvoices(filtered)
        return filtered
    }

    const fetchMatchingInvoices = async () => {
        if (!amount) return

        setIsLoading(true)
        setError(null)

        try {
            console.log('Searching for sales invoices with amount:', amount)
            
            // Use Frappe SDK to get sales invoices
            const response = await fetch('/api/method/frappe.client.get_list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Frappe-CSRF-Token': (window as any).csrf_token || '',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    doctype: 'Sales Invoice',
                    fields: ['name', 'customer', 'customer_name', 'posting_date', 'grand_total', 'status', 'outstanding_amount', 'due_date', 'currency'],
                    filters: [
                        ['grand_total', '=', amount],
                        ['status', '!=', 'Cancelled'],
                        ['status', '!=', 'Draft'],
                        ['status', '!=', 'Paid'],
                        ['company', '=', currentCompany]
                    ],
                    order_by: 'posting_date desc',
                    limit_page_length: 10
                })
            })

            console.log('API Response status:', response.status)
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const data = await response.json()
            console.log('API Response data:', data)

            if (data && data.message && data.message.length > 0) {
                console.log('Found sales invoices:', data.message)
                setInvoices(data.message)
                filterAndSortInvoices(data.message)
            } else {
                console.log('No exact amount match found, trying fallback search...')
                await fetchFallbackInvoices()
            }
        } catch (err) {
            console.error('Error fetching sales invoices:', err)
            const errorMessage = err instanceof Error ? err.message : 'Unknown error'
            console.error('Error details:', errorMessage)
            setError(`Failed to load sales invoices: ${errorMessage}`)
            setInvoices([])
        } finally {
            setIsLoading(false)
        }
    }

    const fetchFallbackInvoices = async () => {
        try {
            console.log('Performing fallback search for sales invoices...')
            
            // Search for invoices with outstanding amounts
            const response = await fetch('/api/method/frappe.client.get_list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Frappe-CSRF-Token': (window as any).csrf_token || '',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    doctype: 'Sales Invoice',
                    fields: ['name', 'customer', 'customer_name', 'posting_date', 'grand_total', 'status', 'outstanding_amount', 'due_date', 'currency'],
                    filters: [
                        ['outstanding_amount', '>', 0],
                        ['status', '!=', 'Cancelled'],
                        ['status', '!=', 'Draft'],
                        ['status', '!=', 'Paid'],
                        ['company', '=', currentCompany]
                    ],
                    order_by: 'posting_date desc',
                    limit_page_length: 20
                })
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const data = await response.json()
            console.log('Fallback search response:', data)

            if (data && data.message && data.message.length > 0) {
                // Filter invoices that might be relevant (within 10% of the amount)
                const relevantInvoices = data.message.filter((invoice: SalesInvoice) => {
                    const invoiceAmount = invoice.outstanding_amount || invoice.grand_total
                    const difference = Math.abs(invoiceAmount - (amount || 0))
                    const percentageDifference = amount ? (difference / amount) * 100 : 0
                    return percentageDifference <= 10 // Within 10%
                })

                console.log('Relevant invoices from fallback search:', relevantInvoices)
                setInvoices(relevantInvoices)
                filterAndSortInvoices(relevantInvoices)
            } else {
                console.log('No invoices found in fallback search')
                setInvoices([])
            }
        } catch (err) {
            console.error('Error in fallback search:', err)
            setInvoices([])
        }
    }

    const showAllInvoices = async () => {
        try {
            console.log('Fetching all sales invoices for debugging...')
            setIsLoading(true)
            
            const response = await fetch('/api/method/frappe.client.get_list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Frappe-CSRF-Token': (window as any).csrf_token || '',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    doctype: 'Sales Invoice',
                    fields: ['name', 'customer', 'customer_name', 'posting_date', 'grand_total', 'status', 'outstanding_amount', 'due_date', 'currency'],
                    filters: [
                        ['status', '!=', 'Cancelled'],
                        ['status', '!=', 'Draft'],
                        ['status', '!=', 'Paid'],
                        ['company', '=', currentCompany]
                    ],
                    order_by: 'posting_date desc',
                    limit_page_length: 50
                })
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const data = await response.json()
            console.log('All invoices response:', data)

            if (data && data.message && data.message.length > 0) {
                console.log('Found all invoices:', data.message)
                setInvoices(data.message)
                filterAndSortInvoices(data.message)
            } else {
                console.log('No invoices found in system')
                setInvoices([])
                setFilteredInvoices([])
            }
        } catch (err) {
            console.error('Error fetching all invoices:', err)
            const errorMessage = err instanceof Error ? err.message : 'Unknown error'
            setError(`Failed to load all invoices: ${errorMessage}`)
        } finally {
            setIsLoading(false)
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Paid':
                return 'bg-green-100 text-green-800 border-green-200'
            case 'Unpaid':
                return 'bg-red-100 text-red-800 border-red-200'
            case 'Overdue':
                return 'bg-yellow-100 text-yellow-800 border-yellow-200'
            case 'Draft':
                return 'bg-gray-100 text-gray-800 border-gray-200'
            case 'Cancelled':
                return 'bg-gray-100 text-gray-500 border-gray-200'
            default:
                return 'bg-gray-100 text-gray-800 border-gray-200'
        }
    }

    if (isLoading) {
        return (
            <Card className="border-blue-200 bg-blue-50/30">
                <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                        <span className="text-sm text-blue-700">Searching for matching sales invoices...</span>
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (error) {
        return (
            <Card className="border-red-200 bg-red-50/30">
                <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-red-600" />
                        <span className="text-sm text-red-700">{error}</span>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={fetchMatchingInvoices}
                            className="ml-auto"
                        >
                            Retry
                        </Button>
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (filteredInvoices.length === 0) {
        console.log('Rendering "no results" section with sorting controls')
        return (
            <div className="space-y-3">
                <Card className="border-gray-200 bg-gray-50/30">
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-gray-600" />
                            <div className="flex flex-col gap-1">
                                <span className="text-sm text-gray-700">No matching sales invoices found for ₹{formatCurrency(amount || 0)}</span>
                                <span className="text-xs text-gray-500">Searched for exact amount match and similar outstanding invoices</span>
                            </div>
                        </div>
                        <div className="mt-3">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={showAllInvoices}
                                className="text-xs"
                            >
                                <Search className="h-3 w-3 mr-1" />
                                Show All Invoices (Debug)
                            </Button>
                        </div>
                    </CardContent>
                </Card>

            </div>
        )
    }

    console.log('Rendering main section with', filteredInvoices.length, 'invoices')
    return (
        <div className="space-y-3">
            {filteredInvoices.map((invoice) => (
                <Card key={invoice.name} className="border-green-200 bg-green-50/30 hover:shadow-md transition-all duration-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-green-100 text-green-700">
                                    <FileText className="h-4 w-4" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="font-semibold text-lg">Sales Invoice</span>
                                    <div className="flex items-center gap-2">
                                        <a 
                                            target="_blank"
                                            href={`/app/sales-invoice/${invoice.name}`}
                                            className="underline underline-offset-2 font-medium text-green-700 hover:text-green-800 flex items-center gap-1"
                                        >
                                            {invoice.name}
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                        <Badge className={getStatusColor(invoice.status)}>
                                            {invoice.status}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-semibold text-lg text-green-700">
                                    ₹{formatCurrency(invoice.grand_total)}
                                </div>
                                {invoice.outstanding_amount && invoice.outstanding_amount > 0 && (
                                    <div className="text-sm text-gray-600">
                                        Outstanding: ₹{formatCurrency(invoice.outstanding_amount)}
                                    </div>
                                )}
                            </div>
                        </CardTitle>
                    </CardHeader>
                    
                    <CardContent className="pt-0 space-y-3">
                        <div className="flex items-center justify-between p-2.5 bg-background/60 rounded-lg border border-border/50">
                            <div className="flex items-center gap-2">
                                <Search className="w-4 h-4 text-green-600" />
                                <span className="text-sm font-medium text-foreground">Potential Match</span>
                            </div>
                            <Badge variant="outline" className="text-xs font-medium bg-green-100 text-green-700 border-green-300">
                                Amount: ₹{formatCurrency(amount || 0)}
                            </Badge>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-gray-600" />
                                <span className="text-sm font-medium text-foreground">Customer:</span>
                                <a 
                                    target="_blank"
                                    href={`/app/customer/${invoice.customer}`}
                                    className="underline underline-offset-2 font-medium text-green-700 hover:text-green-800"
                                >
                                    {invoice.customer_name || invoice.customer}
                                </a>
                            </div>

                            <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-gray-600" />
                                <span className="text-sm font-medium text-foreground">Posted On:</span>
                                <span className="text-sm">{formatDate(invoice.posting_date)}</span>
                            </div>

                            {invoice.due_date && (
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-gray-600" />
                                    <span className="text-sm font-medium text-foreground">Due Date:</span>
                                    <span className="text-sm">{formatDate(invoice.due_date)}</span>
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <DollarSign className="h-4 w-4 text-gray-600" />
                                <span className="text-sm font-medium text-foreground">Total Amount:</span>
                                <span className="text-sm font-semibold text-green-700">
                                    ₹{formatCurrency(invoice.grand_total)}
                                </span>
                            </div>
                        </div>

                        <div className="pt-2">
                            <Button
                                variant="outline"
                                className="w-full bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700 font-medium"
                                size="sm"
                                onClick={() => {
                                    console.log('Create payment entry for invoice:', invoice.name, 'Transaction:', transaction.name)
                                    setRecordPaymentModalOpen(true)
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    <span>Create Payment Entry</span>
                                </div>
                            </Button>
                            <p className="text-sm text-muted-foreground mt-2 text-center leading-relaxed">
                                Create a payment entry against this invoice for the selected transaction
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export default SalesInvoiceDetails
