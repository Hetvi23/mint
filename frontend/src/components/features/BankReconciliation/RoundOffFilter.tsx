import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import _ from '@/lib/translate'
import { Filter } from 'lucide-react'
import { bankRecRoundOffValueAtom } from './bankRecAtoms'
import { useAtom } from 'jotai'
import { useEffect, useState } from 'react'

const RoundOffFilter = () => {
    const [roundOffValue, setRoundOffValue] = useAtom(bankRecRoundOffValueAtom)
    const [tempValue, setTempValue] = useState(roundOffValue.toString())
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        setTempValue(roundOffValue.toString())
    }, [roundOffValue])

    const handleSave = () => {
        const numValue = parseInt(tempValue)
        if (!isNaN(numValue) && numValue > 0) {
            setRoundOffValue(numValue)
            console.log('Round off value updated to:', numValue)
            setIsOpen(false) // Close the popover
        }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave()
        }
    }

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <Tooltip>
                <PopoverTrigger asChild>
                    <TooltipTrigger asChild>
                        <Button 
                            size='sm' 
                            variant='outline' 
                            aria-label={_("Configure round off value for amount matching")}
                            onClick={() => {
                                console.log('Round off filter clicked')
                                setIsOpen(true)
                            }}
                        >
                            <Filter />
                        </Button>
                    </TooltipTrigger>
                </PopoverTrigger>
                <TooltipContent>
                    {_("Configure round off value for amount matching")}
                </TooltipContent>
            </Tooltip>
            <PopoverContent className="w-80">
                <div className="flex flex-col gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-gray-600" />
                            <span className="text-sm font-medium text-gray-700">Round Off Value</span>
                        </div>
                        <p className="text-xs text-gray-500">
                            Set the range tolerance for invoice matching. 
                            Invoices within this range (±value) will be shown as matches.
                        </p>
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="round-off-value">Range Tolerance (₹)</Label>
                        <Input
                            id="round-off-value"
                            type="number"
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="100"
                            min="1"
                            className="w-full"
                        />
                        <div className="flex gap-2">
                            <Button 
                                size="sm" 
                                onClick={handleSave}
                                className="flex-1"
                            >
                                Save
                            </Button>
                            <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                    setTempValue(roundOffValue.toString())
                                    setIsOpen(false)
                                }}
                                className="flex-1"
                            >
                                Reset
                            </Button>
                        </div>
                    </div>

                </div>
            </PopoverContent>
        </Popover>
    )
}

export default RoundOffFilter
