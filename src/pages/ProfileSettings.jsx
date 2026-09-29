import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateName, changePassword, requestEmailChange } from '../services/profileService';

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const inputClass = (hasError) =>
  `w-full bg-surface-container-low border rounded-xl px-4 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${hasError ? 'border-error' : 'border-outline-variant'}`;

function Banner({ tone, children }) {
  const toneClass =
    tone === 'error'
      ? 'bg-error-container/20 border-error/30 text-error'
      : 'bg-primary/10 border-primary/30 text-primary';
  return (
    <div role="alert" className={`border p-3 rounded-xl text-label-xs mb-4 ${toneClass}`}>
      {children}
    </div>
  );
}

function SectionCard({ title, description, children }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm max-w-2xl">
      <h3 className="text-headline-sm font-bold text-on-surface mb-1">{title}</h3>
      {description && <p className="text-label-xs text-on-surface-variant mb-4">{description}</p>}
      {children}
    </div>
  );
}

function SaveButton({ loading, label, loadingLabel, icon = 'save' }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="bg-primary text-on-primary font-label-sm py-2.5 px-5 rounded-xl hover:bg-primary/90 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2 font-semibold disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {loading ? (
        <>
          <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
          <span>{loadingLabel}</span>
        </>
      ) : (
        <>
          <span className="material-symbols-outlined text-sm">{icon}</span>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

function NameForm() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      setError('Name must be between 2 and 120 characters');
      return;
    }

    setLoading(true);
    try {
      const updated = await updateName(trimmed);
      updateUser({ name: updated.name });
      setSuccess('Name updated successfully.');
    } catch (err) {
      setError(err.message || 'Unable to update name. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SectionCard title="Change Name" description="This is the name shown across your GreenMove dashboard.">
      {error && <Banner tone="error">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-label-xs font-semibold text-on-surface mb-1">Full name</label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass(!!error)}
            placeholder="Your name"
          />
        </div>
        <SaveButton loading={loading} label="Save name" loadingLabel="Saving..." />
      </form>
    </SectionCard>
  );
}

function PasswordForm() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validate = () => {
    const errors = {};
    if (!form.currentPassword) errors.currentPassword = 'Current password is required';
    if (!form.newPassword || form.newPassword.length < 8) errors.newPassword = 'Password must be at least 8 characters';
    if (form.confirmPassword !== form.newPassword) errors.confirmPassword = 'Passwords do not match';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!validate()) return;

    setLoading(true);
    try {
      await changePassword(form);
      setSuccess('Password updated successfully. We’ve sent a security notification to your email.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError(err.message || 'Unable to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (user?.authProvider === 'GOOGLE') {
    return (
      <SectionCard title="Change Password" description="Password managed by Google.">
        <p className="text-label-xs text-on-surface-variant">
          Your account signs in with Google, so there’s no GreenMove password to change here.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Change Password" description="Use a strong password you don’t use elsewhere.">
      {error && <Banner tone="error">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="currentPassword" className="block text-label-xs font-semibold text-on-surface mb-1">Current password</label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={handleChange}
            className={inputClass(!!fieldErrors.currentPassword)}
            placeholder="••••••••"
          />
          {fieldErrors.currentPassword && <p className="text-error text-label-xs mt-1">{fieldErrors.currentPassword}</p>}
        </div>
        <div>
          <label htmlFor="newPassword" className="block text-label-xs font-semibold text-on-surface mb-1">New password</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={handleChange}
            className={inputClass(!!fieldErrors.newPassword)}
            placeholder="••••••••"
          />
          {fieldErrors.newPassword && <p className="text-error text-label-xs mt-1">{fieldErrors.newPassword}</p>}
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-label-xs font-semibold text-on-surface mb-1">Confirm new password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={handleChange}
            className={inputClass(!!fieldErrors.confirmPassword)}
            placeholder="••••••••"
          />
          {fieldErrors.confirmPassword && <p className="text-error text-label-xs mt-1">{fieldErrors.confirmPassword}</p>}
        </div>
        <SaveButton loading={loading} label="Update password" loadingLabel="Updating..." icon="lock_reset" />
      </form>
    </SectionCard>
  );
}

function EmailForm() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newEmail: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validate = () => {
    const errors = {};
    if (!form.currentPassword) errors.currentPassword = 'Current password is required';
    if (!form.newEmail.trim()) {
      errors.newEmail = 'New email is required';
    } else if (!isValidEmail(form.newEmail.trim())) {
      errors.newEmail = 'Enter a valid email address';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await requestEmailChange({ currentPassword: form.currentPassword, newEmail: form.newEmail.trim() });
      setSuccess(res?.message || 'Verification link sent. Your email will update once you confirm it.');
      setForm({ currentPassword: '', newEmail: '' });
    } catch (err) {
      setError(err.message || 'Unable to request email change. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (user?.authProvider === 'GOOGLE') {
    return (
      <SectionCard title="Change Email" description="Email managed by Google.">
        <p className="text-label-xs text-on-surface-variant">
          Your account signs in with Google, so your email is managed by your Google account.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Change Email" description="We’ll send a verification link to your new address before switching it over.">
      {error && <Banner tone="error">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="emailCurrentPassword" className="block text-label-xs font-semibold text-on-surface mb-1">Current password</label>
          <input
            id="emailCurrentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={handleChange}
            className={inputClass(!!fieldErrors.currentPassword)}
            placeholder="••••••••"
          />
          {fieldErrors.currentPassword && <p className="text-error text-label-xs mt-1">{fieldErrors.currentPassword}</p>}
        </div>
        <div>
          <label htmlFor="newEmail" className="block text-label-xs font-semibold text-on-surface mb-1">New email</label>
          <input
            id="newEmail"
            name="newEmail"
            type="email"
            autoComplete="email"
            value={form.newEmail}
            onChange={handleChange}
            className={inputClass(!!fieldErrors.newEmail)}
            placeholder="you@example.com"
          />
          {fieldErrors.newEmail && <p className="text-error text-label-xs mt-1">{fieldErrors.newEmail}</p>}
        </div>
        <SaveButton loading={loading} label="Send verification link" loadingLabel="Sending..." icon="mail" />
      </form>
    </SectionCard>
  );
}

export default function ProfileSettings() {
  const { user } = useAuth();

  return (
    <div className="p-md lg:p-lg text-on-surface space-y-6">
      <div>
        <h2 className="text-headline-md font-headline-md text-primary mb-1">Profile Settings</h2>
        <p className="text-body-md text-on-surface-variant">Manage your name, password, and email address.</p>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm max-w-2xl flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary text-on-primary font-bold text-headline-md flex items-center justify-center border-2 border-primary/30">
          {user?.name ? user.name.charAt(0).toUpperCase() : '?'}
        </div>
        <div>
          <h3 className="text-headline-sm font-bold text-on-surface">{user?.name}</h3>
          <p className="text-label-xs text-on-surface-variant">{user?.email}</p>
          <span className="inline-block mt-1 px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-[11px] font-bold">
            {user?.authProvider === 'GOOGLE' ? 'Signed in with Google' : 'GreenMove Account'}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        <NameForm />
        <PasswordForm />
        <EmailForm />
      </div>
    </div>
  );
}
