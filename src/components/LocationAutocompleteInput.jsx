import React, { useEffect, useRef, useState } from 'react';
import { searchLocations } from '../services/geocodingService';

/**
 * Shared "real location" autocomplete text input.
 *
 * This is the single implementation of the debounced MapTiler suggestions
 * dropdown originally built for the Plan Route page. It is reused anywhere
 * in the app that needs a user to pick a real, geocoded location (Plan
 * Route's Current Location / Destination fields, Vehicle Pool's Browse
 * search, and the Create Pool form) so there is exactly one place that
 * talks to `searchLocations` / renders suggestions, instead of duplicating
 * that logic per-page.
 *
 * The component is intentionally "dumb" about validity: it only fetches and
 * displays suggestions and reports back whichever one the user clicks via
 * `onSelectLocation`. It is the caller's responsibility to track whether the
 * currently displayed text corresponds to an actually-selected location
 * (see the `selectedLocation` prop) and to block submission otherwise -- see
 * usages in PlanRoute.jsx and VehiclePool.jsx for the pattern.
 */
export default function LocationAutocompleteInput({
  id,
  name,
  value,
  onInputChange,
  onSelectLocation,
  selectedLocation = null,
  placeholder = 'Enter a location...',
  inputClassName,
  hasError = false,
  minChars = 2,
  debounceMs = 450,
  leftIcon = 'location_on',
  leftIconClassName = 'text-on-surface-variant',
  rightSlot = null,
  autoComplete = 'off',
  disabled = false,
  onFocus,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const containerRef = useRef(null);

  // Debounced fetch of real-location suggestions, mirroring Plan Route's
  // original behavior: skip while the box is basically empty, and skip
  // re-searching immediately after a location has just been selected.
  useEffect(() => {
    const text = value || '';

    if (text.trim().length < minChars) {
      setSuggestions([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    if (selectedLocation && text === selectedLocation.name) {
      setSuggestions([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    setSearchError(null);

    const delayDebounceFn = setTimeout(async () => {
      try {
        const results = await searchLocations(text);
        setSuggestions(results);
        if (results.length === 0) {
          setSearchError('No locations found');
        }
      } catch (err) {
        setSuggestions([]);
        setSearchError('Unable to search locations');
      } finally {
        setSearching(false);
      }
    }, debounceMs);

    return () => clearTimeout(delayDebounceFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, selectedLocation, minChars, debounceMs]);

  // Close the dropdown when clicking outside the input/list.
  useEffect(() => {
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setSuggestions([]);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelect = (loc) => {
    setSuggestions([]);
    setSearchError(null);
    onSelectLocation(loc);
  };

  const showsErrorBorder = hasError || (!searching && !!searchError);

  const defaultInputClassName = `w-full bg-white rounded-lg border pl-9 ${
    rightSlot ? 'pr-9' : 'pr-3'
  } py-2 text-body-md font-body-md text-on-surface text-sm outline-none focus:border-primary ${
    showsErrorBorder ? 'border-error' : 'border-tertiary-fixed'
  }`;

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <span
          className={`material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sm ${leftIconClassName}`}
        >
          {leftIcon}
        </span>
        <input
          id={id}
          name={name}
          type="text"
          autoComplete={autoComplete}
          value={value}
          disabled={disabled}
          onFocus={onFocus}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={placeholder}
          className={inputClassName || defaultInputClassName}
        />
        {rightSlot}
      </div>

      {suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-tertiary-fixed shadow-lg z-30 max-h-48 overflow-y-auto">
          {suggestions.map((item, idx) => (
            <div
              key={idx}
              onClick={() => handleSelect(item)}
              className="p-2.5 hover:bg-surface-container-low cursor-pointer border-b border-outline-variant/20 last:border-0 text-body-md text-on-surface flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-sm">location_on</span>
              <span className="truncate">{item.name}</span>
            </div>
          ))}
        </div>
      )}

      {searching && <p className="text-on-surface-variant text-label-xs mt-1">Searching...</p>}
      {!searching && searchError && <p className="text-error text-label-xs mt-1">{searchError}</p>}
    </div>
  );
}
