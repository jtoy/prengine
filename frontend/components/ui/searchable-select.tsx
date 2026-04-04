"use client"

import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Option {
  value: string
  label: string
}

interface SearchableSelectProps {
  options: Option[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Search and select...",
  disabled = false,
  className,
  id,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filter options based on search
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(search.toLowerCase()) ||
    option.value.toLowerCase().includes(search.toLowerCase())
  )

  // Get display value
  const selectedOption = options.find(option => option.value === value)
  const displayValue = selectedOption ? selectedOption.label : ""

  // Handle option selection
  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue)
    setSearch("")
    setOpen(false)
    inputRef.current?.blur()
  }

  // Handle input focus
  const handleInputFocus = () => {
    if (!disabled) {
      setOpen(true)
      setSearch("")
    }
  }

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    if (!open) setOpen(true)
  }

  // Handle click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setOpen(false)
        setSearch("")
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false)
      setSearch("")
      inputRef.current?.blur()
    } else if (e.key === "Enter" && filteredOptions.length === 1) {
      e.preventDefault()
      handleSelect(filteredOptions[0].value)
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!open) setOpen(true)
    }
  }

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          value={open ? search : displayValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-10"
          autoComplete="off"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={() => {
            if (!disabled) {
              setOpen(!open)
              if (!open) {
                inputRef.current?.focus()
              }
            }
          }}
          disabled={disabled}
        >
          <ChevronDown 
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "transform rotate-180"
            )} 
          />
        </Button>
      </div>

      {open && !disabled && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No branches found
            </div>
          ) : (
            <div className="py-1">
              {filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "relative w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
                    value === option.value && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => handleSelect(option.value)}
                >
                  <span className="block truncate">{option.label}</span>
                  {value === option.value && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}