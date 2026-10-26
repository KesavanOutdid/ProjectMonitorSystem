'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getBackendUrl } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { formatRole } from '../lib/formatters';
import {
  X,
  User,
  Lock,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Mail,
  ShieldCheck,
  KeyRound,
  Sparkles,
  Camera,
  UploadCloud,
  Loader2
} from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const { user, setUser } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');

  // Profile Form States
  const [name, setName] = useState(user?.name || '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || '');

  // Password Form States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    if (user) {
      setName(user.name || '');
      setJobTitle(user.jobTitle || '');
    }
  }, [user]);

  // Upload Avatar Mutation
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      setMessage(null);
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await api.post('/auth/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data;
    },
    onSuccess: (data) => {
      setUser(data.data);
      setMessage({ type: 'success', text: 'Profile picture updated successfully!' });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: any) => {
      setMessage({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to upload profile picture'
      });
    }
  });

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadAvatarMutation.mutate(e.target.files[0]);
    }
  };

  // Update Profile Mutation
  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      setMessage(null);
      const res = await api.put('/auth/profile', {
        name,
        jobTitle
      });
      return res.data;
    },
    onSuccess: (data) => {
      setUser(data.data);
      setMessage({ type: 'success', text: 'Profile details updated successfully!' });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: any) => {
      setMessage({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to update profile'
      });
    }
  });

  // Change Password Mutation
  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      setMessage(null);
      if (newPassword !== confirmPassword) {
        throw new Error('New password and confirmation do not match');
      }
      if (newPassword.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      const res = await api.put('/auth/change-password', {
        currentPassword,
        newPassword
      });
      return res.data;
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: 'Password changed successfully!' });
    },
    onError: (err: any) => {
      setMessage({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to change password'
      });
    }
  });

  if (!isOpen || !isMounted) return null;

  const userAvatarUrl = user?.avatar
    ? user.avatar.startsWith('http')
      ? user.avatar
      : `${getBackendUrl()}${user.avatar.startsWith('/') ? '' : '/'}${user.avatar}`
    : null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl border border-[#0F172A]/10 shadow-2xl w-full max-w-lg overflow-hidden text-[#111827] my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#0F172A]/10 flex items-center justify-between bg-[#F3F4F6]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#0F172A] text-white flex items-center justify-center font-bold text-xs shadow-xs overflow-hidden">
              {userAvatarUrl ? (
                <img src={userAvatarUrl} alt={user?.name} className="w-full h-full object-cover" />
              ) : (
                user?.name?.charAt(0) || 'U'
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#111827]">Account & Profile Settings</h2>
              <p className="text-[11px] text-[#111827]/60">Manage personal identity and security credentials</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#111827]/50 hover:text-[#111827] rounded-lg cursor-pointer transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-3 pb-2 flex items-center gap-2 border-b border-[#0F172A]/10 bg-[#F3F4F6]/50">
          <button
            type="button"
            onClick={() => {
              setActiveTab('profile');
              setMessage(null);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-[#0F172A] text-white shadow-xs'
                : 'text-[#111827]/70 hover:text-[#111827] hover:bg-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile Details</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('password');
              setMessage(null);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'password'
                ? 'bg-[#0F172A] text-white shadow-xs'
                : 'text-[#111827]/70 hover:text-[#111827] hover:bg-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Change Password</span>
          </button>
        </div>

        {/* Feedback Message */}
        {message && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-[#22C55E]/10 text-[#111827] border border-[#22C55E]/30'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-[#22C55E]" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Profile Tab Body */}
        {activeTab === 'profile' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateProfileMutation.mutate();
            }}
            className="p-6 flex flex-col gap-4"
          >
            {/* Profile Avatar Upload Zone */}
            <div className="flex items-center gap-4 p-4 bg-[#F8FAFC] border border-gray-200/80 rounded-2xl shadow-2xs">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFileSelect}
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative w-16 h-16 rounded-2xl bg-[#0F172A] text-white flex items-center justify-center font-bold text-xl shadow-md cursor-pointer group overflow-hidden shrink-0 ring-2 ring-[#0F172A]/10 hover:ring-[#22C55E]/50 transition-all"
                title="Click or drop image to upload"
              >
                {userAvatarUrl ? (
                  <img
                    src={userAvatarUrl}
                    alt={user?.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <span>{user?.name?.charAt(0) || 'U'}</span>
                )}

                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-0.5 transition-opacity">
                  {uploadAvatarMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  ) : (
                    <>
                      <Camera className="w-5 h-5 text-white" />
                      <span className="text-[9px] font-bold text-white">Change</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <h4 className="text-xs font-bold text-[#111827]">Profile Photo</h4>
                  {user?.avatar && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.put('/auth/profile', { avatar: '' });
                          setUser(res.data.data);
                          setMessage({ type: 'success', text: 'Profile picture removed.' });
                          queryClient.invalidateQueries({ queryKey: ['me'] });
                        } catch (err: any) {
                          setMessage({ type: 'error', text: 'Failed to remove picture' });
                        }
                      }}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 mb-2.5">
                  PNG, JPG, or GIF up to 5MB. Click photo to change.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadAvatarMutation.isPending}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-98"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-[#22C55E]" />
                    <span>{uploadAvatarMutation.isPending ? 'Uploading...' : 'Upload Image'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#111827] uppercase tracking-wider mb-1">
                Full Name *
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#111827]/40" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#F3F4F6] focus:bg-white border border-[#0F172A]/10 rounded-xl outline-none focus:border-[#0F172A] font-medium text-[#111827]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#111827]/60 uppercase tracking-wider mb-1">
                Email Address (Read-only)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#111827]/40" />
                <input
                  type="email"
                  disabled
                  value={user?.email || ''}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#F3F4F6]/50 border border-[#0F172A]/10 rounded-xl text-[#111827]/50 font-medium cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#111827] uppercase tracking-wider mb-1">
                Job Title / Position
              </label>
              <div className="relative">
                <Briefcase className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#111827]/40" />
                <input
                  type="text"
                  placeholder="e.g. Senior Frontend Engineer / Scrum Master"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#F3F4F6] focus:bg-white border border-[#0F172A]/10 rounded-xl outline-none focus:border-[#0F172A] font-medium text-[#111827]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#111827]/60 uppercase tracking-wider mb-1">
                System Role & Workspace Access
              </label>
              <div className="p-3 bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#0F172A]" />
                  <span className="text-[#111827]/70">Global Role:</span>
                </div>
                <span className="text-[#0F172A] bg-white border border-[#0F172A]/15 px-2.5 py-0.5 rounded font-bold">
                  {formatRole(user?.role)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#0F172A]/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-[#111827]/70 hover:text-[#111827] hover:bg-[#F3F4F6] rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={updateProfileMutation.isPending}
                className="px-5 py-2 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#111827] rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {updateProfileMutation.isPending ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        )}

        {/* Password Tab Body */}
        {activeTab === 'password' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              changePasswordMutation.mutate();
            }}
            className="p-6 flex flex-col gap-4"
          >
            <div>
              <label className="block text-[11px] font-bold text-[#111827] uppercase tracking-wider mb-1">
                Current Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#111827]/40" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#F3F4F6] focus:bg-white border border-[#0F172A]/10 rounded-xl outline-none focus:border-[#0F172A] font-medium text-[#111827]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#111827] uppercase tracking-wider mb-1">
                New Password (min 6 characters) *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#111827]/40" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#F3F4F6] focus:bg-white border border-[#0F172A]/10 rounded-xl outline-none focus:border-[#0F172A] font-medium text-[#111827]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#111827] uppercase tracking-wider mb-1">
                Confirm New Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#111827]/40" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#F3F4F6] focus:bg-white border border-[#0F172A]/10 rounded-xl outline-none focus:border-[#0F172A] font-medium text-[#111827]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#0F172A]/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-[#111827]/70 hover:text-[#111827] hover:bg-[#F3F4F6] rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={changePasswordMutation.isPending}
                className="px-5 py-2 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#111827] rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};
