import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, X, FileText, User, Calendar, DollarSign } from "lucide-react"
import { useFrappeGetCall } from 'frappe-react-sdk'
import { formatCurrency } from "@/lib/numbers"
import { formatDate } from "@/lib/date"

interface SalesInvoice {
    name: string
    customer: string
    posting_date: string
    grand_total: number
    status: string
    outstanding_amount?: number
}

interface InvoiceMatchingProps {
    transactionAmount: number
    onClose: () => void
}

const InvoiceMatching: React.FC<InvoiceMatchingProps> = ({ transactionAmount, onClose }) => {
    const [searchAmount, setSearchAmount] = useState<number>(transactionAmount)
    const [isSearching, setIsSearching] = useState(false)

    // Use Frappe's get_list API to search for matching invoices
    const { data: invoices, error, isLoading, mutate } = useFrappeGetCall<{
        message: SalesInvoice[]
    }>('frappe.client.get_list', {
        doctype: 'Sales Invoice',
        fields: ['name', 'customer', 'posting_date', 'grand_total', 'status', 'outstanding_amount'],
        filters: [['grand_total', '=', searchAmount]],
        order_by: 'posting_date desc',
        limit_page_length: 10
    }, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false
    })

    const handleSearch = async () => {
        setIsSearching(true)
        try {
            await mutate()
        } finally {
            setIsSearching(false)
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Paid':
                return 'bg-green-100 text-green-800'
            case 'Unpaid':
                return 'bg-red-100 text-red-800'
            case 'Overdue':
                return 'bg-yellow-100 text-yellow-800'
            case 'Draft':
                return 'bg-gray-100 text-gray-800'
            case 'Cancelled':
                return 'bg-gray-100 text-gray-500'
            default:
                return 'bg-gray-100 text-gray-800'
        }
    }

    return (
        <Card className="w-96 fixed top-20 right-4 z-50 shadow-lg">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <Search className="h-5 w-5" />
                        Invoice Matching
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="h-6 w-6 p-0"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
                {/* Search Input */}
                <div className="space-y-2">
                    <label className="text-sm font-medium">Search Amount</label>
                    <div className="flex gap-2">
                        <Input
                            type="number"
                            value={searchAmount}
                            onChange={(e) => setSearchAmount(parseFloat(e.target.value) || 0)}
                            placeholder="Enter amount to search"
                            className="flex-1"
                        />
                        <Button
                            onClick={handleSearch}
                            disabled={isSearching}
                            size="sm"
                        >
                            <Search className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Results */}
                <div className="space-y-3">
                    {isLoading && (
                        <div className="text-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="text-sm text-gray-600 mt-2">Searching...</p>
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-4">
                            <p className="text-sm text-red-600">Error searching invoices</p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleSearch}
                                className="mt-2"
                            >
                                Try Again
                            </Button>
                        </div>
                    )}

                    {invoices?.message && invoices.message.length > 0 ? (
                        <>
                            <div className="text-sm text-gray-600">
                                Found {invoices.message.length} invoice(s) matching ₹{searchAmount.toLocaleString()}
                            </div>
                            
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {invoices.message.map((invoice) => (
                                    <div
                                        key={invoice.name}
                                        className="border rounded-lg p-3 hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <FileText className="h-4 w-4 text-blue-600" />
                                                <span className="font-medium text-sm">{invoice.name}</span>
                                            </div>
                                            <Badge className={getStatusColor(invoice.status)}>
                                                {invoice.status}
                                            </Badge>
                                        </div>
                                        
                                        <div className="space-y-1 text-sm text-gray-600">
                                            <div className="flex items-center gap-2">
                                                <User className="h-3 w-3" />
                                                <span>{invoice.customer}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-3 w-3" />
                                                <span>{formatDate(invoice.posting_date)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <DollarSign className="h-3 w-3" />
                                                <span className="font-medium">
                                                    ₹{formatCurrency(invoice.grand_total)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        invoices?.message && (
                            <div className="text-center py-8">
                                <div className="text-6xl mb-4">💸</div>
                                <p className="text-sm text-gray-600 font-medium mb-1">No matching invoices found</p>
                                <p className="text-xs text-gray-500">
                                    No Sales Invoice found with amount ₹{searchAmount.toLocaleString()}
                                </p>
                            </div>
                        )
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

export default InvoiceMatching

