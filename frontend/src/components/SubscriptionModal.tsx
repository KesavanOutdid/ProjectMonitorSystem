'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  X,
  Check,
  Zap,
  Crown,
  Building,
  ShieldCheck,
  HardDrive
} from 'lucide-react';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PLANS = [
  {
    id: 'FREE',
    name: 'Free Starter',
    price: '$0',
    period: '/month',
    features: ['Up to 3 Projects', 'Up to 5 Team Members', '500MB Local Storage', 'Standard Kanban Board'],
    color: 'border-[#0F172A]/10 bg-[#F3F4F6]/60'
  },
  {
    id: 'PRO',
    name: 'Professional',
    price: '$29',
    period: '/month',
    popular: true,
    features: ['Up to 50 Projects', 'Up to 100 Team Members', '50GB Storage (S3 Ready)', 'Sub-5ms Query Caching', 'Custom Field Labels', 'Priority Email Support'],
    color: 'border-[#0F172A] bg-white shadow-md'
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise Scale',
    price: '$99',
    period: '/month',
    features: ['Unlimited Projects & Tasks', 'Unlimited Team Members', '1TB Cloud Storage', 'Full S3/R2 Export', 'Custom SLA Guarantee', 'Dedicated Account Lead'],
    color: 'border-[#0F172A] bg-[#0F172A] text-white shadow-xl'
  }
];

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { data: subData } = useQuery({
    queryKey: ['current-subscription'],
    queryFn: async () => {
      const res = await api.get('/subscriptions/current');
      return res.data.data;
    },
    enabled: isOpen
  });

  const upgradeMutation = useMutation({
    mutationFn: async (planType: string) => {
      const res = await api.post('/subscriptions/upgrade', { planType });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-subscription'] });
      alert('Subscription plan updated successfully!');
      onClose();
    }
  });

  if (!isOpen || !isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-2xl border border-[#0F172A]/10 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-[#111827] my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#0F172A]/10 flex items-center justify-between bg-[#F3F4F6]/80">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-[#F59E0B]" />
            <div>
              <h2 className="text-sm font-bold text-[#111827]">Workspace Subscription & Capacity</h2>
              <p className="text-[11px] text-[#111827]/60">Current active plan: <strong className="text-[#0F172A]">{subData?.planType || 'FREE'}</strong></p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[#111827]/50 hover:text-[#111827] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pricing Cards */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((p) => {
            const isCurrent = subData?.planType === p.id;
            return (
              <div
                key={p.id}
                className={`p-5 rounded-2xl border flex flex-col justify-between relative transition-all ${p.color}`}
              >
                {p.popular && (
                  <span className="absolute -top-2.5 right-4 bg-[#22C55E] text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                    Most Popular
                  </span>
                )}

                <div>
                  <h3 className={`text-sm font-bold ${p.id === 'ENTERPRISE' ? 'text-white' : 'text-[#111827]'}`}>
                    {p.name}
                  </h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className={`text-2xl font-black ${p.id === 'ENTERPRISE' ? 'text-white' : 'text-[#111827]'}`}>
                      {p.price}
                    </span>
                    <span className={`text-xs ${p.id === 'ENTERPRISE' ? 'text-slate-300' : 'text-[#111827]/60'}`}>
                      {p.period}
                    </span>
                  </div>

                  <ul className="mt-4 flex flex-col gap-2">
                    {p.features.map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-xs">
                        <Check className="w-3.5 h-3.5 text-[#22C55E] flex-shrink-0" />
                        <span className={p.id === 'ENTERPRISE' ? 'text-slate-200' : 'text-[#111827]/70'}>
                          {feat}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-2 rounded-xl text-xs font-bold bg-[#F3F4F6] text-[#111827]/50 cursor-not-allowed text-center"
                    >
                      Active Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => upgradeMutation.mutate(p.id)}
                      className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                        p.id === 'ENTERPRISE'
                          ? 'bg-[#22C55E] hover:bg-[#22C55E]/90 text-white'
                          : 'bg-[#0F172A] hover:bg-[#111827] text-white'
                      }`}
                    >
                      Switch to {p.name}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};
