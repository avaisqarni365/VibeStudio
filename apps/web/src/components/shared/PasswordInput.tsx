/**
 * PasswordInput — a single-line password field with a built-in show/hide eye toggle.
 *
 * Used for every place we collect or display sensitive text: login,
 * register, reset, admin user-invite, API key entry, etc. Visibility
 * defaults to hidden so the field still acts as a password field for
 * browsers' password managers; the toggle is for a user who wants to
 * confirm what they typed before submitting (or to avoid the
 * "two-different-typo" failure mode on confirm fields).
 *
 * Props are intentionally a subset of the native input: pass anything
 * else through `inputProps`. The eye icon is rendered absolutely inside
 * a relative wrapper so it works inside any layout. Pass `className` to
 * style the input itself; pass `wrapperClassName` to style the relative
 * <div> around it (e.g. for fixed-width fields).
 */
import { useState } from 'react';

export interface PasswordInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  minLength?: number;
  name?: string;
  id?: string;
  className?: string;
  wrapperClassName?: string;
  autoFocus?: boolean;
  /** Aria label for the toggle button. Defaults to "Show password" / "Hide password". */
  toggleLabelShow?: string;
  toggleLabelHide?: string;
  /** Optional onKeyDown for Enter-to-submit etc. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete = 'current-password',
  required,
  disabled,
  maxLength,
  minLength,
  name,
  id,
  className = 'block w-full h-11 pl-3 pr-11 text-sm bg-white text-sand-900 placeholder-sand-400 border border-sand-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500',
  wrapperClassName = 'relative',
  toggleLabelShow = 'Show password',
  toggleLabelHide = 'Hide password',
  onKeyDown,
  autoFocus,
}: PasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className={wrapperClassName}>
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        maxLength={maxLength}
        minLength={minLength}
        autoFocus={autoFocus}
        className={className}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        tabIndex={-1}
        disabled={disabled}
        aria-label={show ? toggleLabelHide : toggleLabelShow}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-sand-400 hover:text-sand-600 transition-colors disabled:opacity-40"
      >
        {show ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default PasswordInput;
