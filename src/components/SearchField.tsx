"use client";

import React from "react";
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import { createParts } from "@ui-sdk/react/primitive";
import { Search, X } from "lucide-react";
import { searchField } from "./search-field";

// Export raw primitive parts built with @ui-sdk/core definePrimitive
const parts = createParts(searchField, { input: "input", clear: "button" });
export const SearchFieldPrimitiveRoot = parts.Root;
export const SearchFieldPrimitiveInput = parts.Input;
export const SearchFieldPrimitiveClear = parts.Clear;
export { searchField };

export interface SearchFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  iconSize?: number;
  clearIconSize?: number;
}

export function SearchField({
  value,
  onValueChange,
  placeholder = "Search…",
  "aria-label": ariaLabel = "Search",
  className = "",
  autoFocus,
  disabled,
  iconSize = 17,
  clearIconSize = 15,
}: SearchFieldProps) {
  return (
    <InputGroup className={`search-box ${className}`.trim()}>
      <Search size={iconSize} aria-hidden="true" />
      <Input
        type="search"
        value={value}
        onValueChange={(val) => onValueChange(val)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        disabled={disabled}
      />
      <InputClear
        className="search-box-clear"
        aria-label={`Clear ${ariaLabel.toLowerCase()}`}
        title="Clear search"
      >
        <X size={clearIconSize} aria-hidden="true" />
      </InputClear>
    </InputGroup>
  );
}

export default SearchField;
