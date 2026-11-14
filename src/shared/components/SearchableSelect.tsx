'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
  badgeColor?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate' | 'purple' | 'indigo';
  keywords?: string[];
  disabled?: boolean;
}

export interface SearchableSelectProps {
  mode?: 'single' | 'multiple';
  value: string | string[];
  onChange: (value: any) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  allowClear?: boolean;
  clearable?: boolean;
  clearLabel?: string;
  selectAllLabel?: string;
  emptyMessage?: string;
  id?: string;
  name?: string;
  minDropdownWidth?: number;
  autoFocusSearch?: boolean;
  onTabNext?: () => void;
  onEnterNext?: () => void;
  requireSelectionBeforeTab?: boolean;
  onRequireSelection?: () => void;
  showSubLabelInTrigger?: boolean;
}

export function SearchableSelect({
  mode = 'single',
  value,
  onChange,
  options,
  placeholder = '-- Select an option --',
  searchPlaceholder = 'Type to search...',
  disabled = false,
  required = false,
  className = '',
  size = 'md',
  allowClear = false,
  clearable = false,
  clearLabel,
  selectAllLabel,
  emptyMessage = 'No matching records found',
  id,
  name,
  minDropdownWidth,
  autoFocusSearch = true,
  onTabNext,
  onEnterNext,
  requireSelectionBeforeTab = false,
  onRequireSelection,
  showSubLabelInTrigger = false,
}: SearchableSelectProps) {
  const isMultiple = mode === 'multiple';
  const instanceIdRef = useRef<string>(id || `select-${Math.random().toString(36).substring(2, 9)}`);

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [mounted, setMounted] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
    placement: 'bottom' | 'top';
  }>({ top: 0, left: 0, width: 0, placement: 'bottom' });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Normalize selected values
  const selectedValues: string[] = useMemo(() => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value) return [value];
    return [];
  }, [value]);

  const singleValue = typeof value === 'string' ? value : (value?.[0] || '');

  // Find currently selected option for single mode
  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === singleValue);
  }, [options, singleValue]);

  // Find selected options for multi mode
  const selectedOptions = useMemo(() => {
    return options.filter((opt) => selectedValues.includes(opt.value));
  }, [options, selectedValues]);

  // Multi-select trigger label formatter
  const multipleTriggerLabel = useMemo(() => {
    if (selectedOptions.length === 0) {
      return placeholder || 'All';
    }
    if (selectedOptions.length === 1) {
      return selectedOptions[0].label;
    }
    if (selectedOptions.length === 2) {
      return `${selectedOptions[0].label} + ${selectedOptions[1].label}`;
    }
    // 3+ selected: "3 Categories Selected" or "3 Brands Selected"
    let noun = 'Items';
    if (placeholder) {
      const cleaned = placeholder.replace(/^All\s+/i, '').replace(/^[-\s]+|[-\s]+$/g, '').trim();
      if (cleaned) noun = cleaned;
    }
    return `${selectedOptions.length} ${noun} Selected`;
  }, [selectedOptions, placeholder]);

  // Filter options based on search query (multi-token search matching label, subLabel, badge, keywords)
  const filteredOptions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return options;

    const tokens = term.split(/\s+/).filter(Boolean);

    return options.filter((opt) => {
      const labelText = (opt.label || '').toLowerCase();
      const subLabelText = (opt.subLabel || '').toLowerCase();
      const badgeText = (opt.badge || '').toLowerCase();
      const extraKeywords = (opt.keywords || []).join(' ').toLowerCase();

      const combinedText = `${labelText} ${subLabelText} ${badgeText} ${extraKeywords}`;

      return tokens.every((token) => combinedText.includes(token));
    });
  }, [options, searchTerm]);

  // Cap visible items to top 80 for rendering speed
  const visibleOptions = useMemo(() => {
    return filteredOptions.slice(0, 80);
  }, [filteredOptions]);

  // Compute position relative to trigger
  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = 280; // approximate max dropdown height
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let placement: 'bottom' | 'top' = 'bottom';
    let top = rect.bottom + window.scrollY + 4;

    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      placement = 'top';
      top = rect.top + window.scrollY - dropdownHeight - 4;
    }

    const maxAvailableWidth = Math.max(200, window.innerWidth - 16);
    const desiredWidth = minDropdownWidth
      ? Math.max(rect.width, minDropdownWidth)
      : Math.max(rect.width, 240);
    const calculatedWidth = Math.min(desiredWidth, maxAvailableWidth);

    let left = rect.left + window.scrollX;
    // Prevent dropdown from overflowing right screen edge
    if (left + calculatedWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - calculatedWidth - 8);
    }

    setDropdownPosition({
      top,
      left,
      width: calculatedWidth,
      placement,
    });
  };

  // Open & Close Handlers
  const handleOpen = () => {
    if (disabled) return;
    updatePosition();
    setIsOpen(true);
    setSearchTerm('');
    if (!isMultiple) {
      const selIdx = options.findIndex((opt) => opt.value === singleValue);
      setActiveIndex(selIdx >= 0 ? selIdx : -1);
    } else {
      setActiveIndex(-1);
    }

    // Global coordination: notify any other open dropdowns to close
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('saleflow:close-all-dropdowns', {
          detail: { sourceId: instanceIdRef.current },
        })
      );
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearchTerm('');
    setActiveIndex(-1);
  };

  // Same trigger click toggles open/closed
  const handleToggle = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (disabled) return;
    if (isOpen) {
      handleClose();
    } else {
      handleOpen();
    }
  };

  // Global coordination listener: close if another dropdown opens
  useEffect(() => {
    const handleGlobalClose = (e: Event) => {
      const customEvent = e as CustomEvent<{ sourceId?: string }>;
      if (customEvent.detail?.sourceId !== instanceIdRef.current) {
        handleClose();
      }
    };
    window.addEventListener('saleflow:close-all-dropdowns', handleGlobalClose);
    return () => window.removeEventListener('saleflow:close-all-dropdowns', handleGlobalClose);
  }, []);

  // Position updates on scroll / resize while open
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScrollResize = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScrollResize, true);
    window.addEventListener('resize', handleScrollResize);

    return () => {
      window.removeEventListener('scroll', handleScrollResize, true);
      window.removeEventListener('resize', handleScrollResize);
    };
  }, [isOpen, minDropdownWidth]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen && autoFocusSearch) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen, autoFocusSearch]);

  // Click outside listener: clicking outside closes dropdown
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      handleClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  // Keep highlighted item in view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ') {
        e.preventDefault();
        handleOpen();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (singleValue && !isMultiple) {
          if (onEnterNext) {
            onEnterNext();
          } else if (onTabNext) {
            onTabNext();
          }
        } else {
          handleOpen();
        }
        return;
      }
      if (requireSelectionBeforeTab && !singleValue && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        handleOpen();
        if (onRequireSelection) onRequireSelection();
        return;
      }
      // If user types an alphanumeric or printable key while focused on trigger button, open and search immediately
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== 'Tab') {
        e.preventDefault();
        handleOpen();
        setSearchTerm(e.key);
        setActiveIndex(0);
        return;
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
      triggerRef.current?.focus();
      return;
    }

    if (e.key === 'Tab') {
      if (isMultiple) {
        handleClose();
        if (onTabNext) {
          e.preventDefault();
          setTimeout(() => onTabNext?.(), 30);
        } else {
          setTimeout(() => triggerRef.current?.focus(), 30);
        }
        return;
      }

      let selectedVal: string | null = null;
      if (activeIndex >= 0 && activeIndex < visibleOptions.length) {
        const target = visibleOptions[activeIndex];
        if (!target.disabled) {
          selectedVal = target.value;
        }
      } else if (visibleOptions.length === 1 && !visibleOptions[0].disabled) {
        selectedVal = visibleOptions[0].value;
      }
      if (selectedVal !== null) {
        onChange(selectedVal);
        handleClose();
        if (onTabNext) {
          e.preventDefault();
          setTimeout(() => onTabNext?.(), 30);
        } else {
          setTimeout(() => triggerRef.current?.focus(), 30);
        }
        return;
      }

      // If no valid option was selected and requireSelectionBeforeTab is active with no prior selection
      if (requireSelectionBeforeTab && !singleValue && !e.shiftKey) {
        e.preventDefault();
        if (onRequireSelection) onRequireSelection();
        return;
      }

      handleClose();
      if (onTabNext && (!requireSelectionBeforeTab || singleValue)) {
        e.preventDefault();
        setTimeout(() => onTabNext?.(), 30);
      } else {
        setTimeout(() => triggerRef.current?.focus(), 30);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = prev + 1;
        return next >= visibleOptions.length ? 0 : next;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? visibleOptions.length - 1 : next;
      });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      let targetOption: SearchableSelectOption | null = null;
      if (activeIndex >= 0 && activeIndex < visibleOptions.length) {
        targetOption = visibleOptions[activeIndex];
      } else if (visibleOptions.length === 1) {
        targetOption = visibleOptions[0];
      }

      if (targetOption && !targetOption.disabled) {
        handleSelect(targetOption);
      }
      return;
    }
  };

  const handleSelect = (opt: SearchableSelectOption) => {
    if (opt.disabled) return;

    if (isMultiple) {
      const alreadySelected = selectedValues.includes(opt.value);
      const nextValues = alreadySelected
        ? selectedValues.filter((v) => v !== opt.value)
        : [...selectedValues, opt.value];
      onChange(nextValues);
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return;
    }

    // Single mode
    onChange(opt.value);
    handleClose();
    if (onEnterNext) {
      setTimeout(() => onEnterNext?.(), 30);
    } else if (onTabNext) {
      setTimeout(() => onTabNext?.(), 30);
    } else {
      setTimeout(() => triggerRef.current?.focus(), 30);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMultiple) {
      onChange([]);
    } else {
      onChange('');
    }
    triggerRef.current?.focus();
  };

  const getBadgeClass = (color?: string) => {
    switch (color) {
      case 'emerald':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
      case 'blue':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800';
      case 'amber':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
      case 'rose':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';
      case 'purple':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800';
      case 'indigo':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800';
      case 'slate':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  };

  // Size variations
  const isSm = size === 'sm';
  const isLg = size === 'lg';
  const triggerHeightClass = isLg 
    ? 'min-h-[46px] py-2 px-3 text-sm' 
    : isSm 
    ? 'h-8 py-1 px-2.5 text-xs' 
    : 'h-9 py-1.5 px-3 text-xs';

  return (
    <div className="relative inline-block w-full">
      {/* Hidden input to support standard HTML form validation */}
      {required && (
        <input
          tabIndex={-1}
          autoComplete="off"
          style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
          value={isMultiple ? (selectedValues.length > 0 ? 'valid' : '') : singleValue}
          onChange={() => {}}
          required={required}
        />
      )}

      {/* Main Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className={`w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-left transition-all flex items-center justify-between gap-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs hover:border-slate-400 dark:hover:border-slate-600 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden ${triggerHeightClass} ${className}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          {isMultiple ? (
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              {selectedValues.length > 0 ? (
                <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {multipleTriggerLabel}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-500 truncate font-normal">
                  {placeholder}
                </span>
              )}
            </div>
          ) : selectedOption ? (
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              {selectedOption.badge && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${getBadgeClass(
                    selectedOption.badgeColor
                  )}`}
                >
                  {selectedOption.badge}
                </span>
              )}
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate min-w-0">
                {selectedOption.label}
              </span>
              {showSubLabelInTrigger && selectedOption.subLabel && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate min-w-0 hidden sm:inline">
                  • {selectedOption.subLabel}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 truncate font-normal">
              {clearLabel || placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {allowClear && (isMultiple ? selectedValues.length > 0 : !!singleValue) && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 transition-colors"
              title="Clear selection"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
            }`}
          />
        </div>
      </button>

      {/* Floating Dropdown Popover */}
      {isOpen &&
        mounted &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'absolute',
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
              zIndex: 9999,
            }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100"
          >
            {/* Search Input Bar */}
            <div className="p-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={searchPlaceholder}
                  className="w-full h-9 sm:h-8 pl-8 pr-7 rounded-lg text-base sm:text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Multi-select Header Toolbar */}
            {isMultiple && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-[11px]">
                <span className="text-slate-500 font-medium">
                  {selectedValues.length} of {options.length} selected
                </span>
                <div className="flex items-center gap-2">
                  {selectedValues.length < options.length && (
                    <button
                      type="button"
                      onClick={() => {
                        const allAvailable = options.filter((o) => !o.disabled).map((o) => o.value);
                        onChange(allAvailable);
                        searchInputRef.current?.focus();
                      }}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                    >
                      {selectAllLabel || 'Select All'}
                    </button>
                  )}
                  {selectedValues.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onChange([]);
                        searchInputRef.current?.focus();
                      }}
                      className="text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 font-medium"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Clear / All Option (single mode if clearLabel provided and not searching) */}
            {!isMultiple && clearLabel && !searchTerm && (
              <div
                onClick={() => {
                  onChange('');
                  handleClose();
                  triggerRef.current?.focus();
                }}
                className={`px-3 py-2 text-xs font-semibold cursor-pointer border-b border-slate-100 dark:border-slate-800 flex items-center justify-between ${
                  !singleValue
                    ? 'bg-blue-50/70 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <span>{clearLabel}</span>
                {!singleValue && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
              </div>
            )}

            {/* Options List */}
            <div
              ref={listRef}
              className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 py-1"
            >
              {visibleOptions.length === 0 ? (
                <div className="py-6 px-3 text-center text-xs text-slate-400 dark:text-slate-500">
                  {emptyMessage}
                  {searchTerm && (
                    <div className="mt-1 text-[11px] text-slate-400">
                      No results for &quot;<strong className="text-slate-600 dark:text-slate-300">{searchTerm}</strong>&quot;
                    </div>
                  )}
                </div>
              ) : (
                visibleOptions.map((opt, idx) => {
                  const isSelected = isMultiple
                    ? selectedValues.includes(opt.value)
                    : opt.value === singleValue;
                  const isActive = idx === activeIndex;

                  return (
                    <div
                      key={opt.value}
                      onClick={() => handleSelect(opt)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`px-3 py-2 cursor-pointer transition-colors flex items-center justify-between gap-2 text-xs ${
                        opt.disabled
                          ? 'opacity-40 cursor-not-allowed'
                          : isSelected
                          ? 'bg-blue-50/80 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200 font-semibold'
                          : isActive
                          ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* Multi-select Checkbox Box */}
                        {isMultiple && (
                          <div
                            className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        )}

                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate">
                            {opt.badge && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${getBadgeClass(
                                  opt.badgeColor
                                )}`}
                              >
                                {opt.badge}
                              </span>
                            )}
                            <span className="truncate">{opt.label}</span>
                          </div>

                          {opt.subLabel && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {opt.subLabel}
                            </div>
                          )}
                        </div>
                      </div>

                      {!isMultiple && isSelected && (
                        <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 ml-1.5" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Status for large sets */}
            {filteredOptions.length > 80 && (
              <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 text-center font-medium">
                Showing top 80 of {filteredOptions.length} matches • Type to narrow down
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
