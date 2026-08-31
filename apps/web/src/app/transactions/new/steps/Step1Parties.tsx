'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, User, Home, UserCheck, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Data shapes ──────────────────────────────────────────────────────────────

export interface PersonData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface AddressData {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface SellerAgentData extends PersonData {
  licenseNumber: string;
  companyName: string;
}

export interface PartyData extends PersonData {
  mailingAddress: AddressData;
}

export interface PropertyData {
  street: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  apn: string;
  mlsNumber: string;
  transactionType: 'residential' | 'income_property' | 'commercial' | 'land';
}

export interface Step1Data {
  sellerAgent: SellerAgentData;
  property: PropertyData;
  seller: PartyData;
  buyer: PartyData;
  buyerAgent: PersonData | null;  // null = no buyer agent added
  side: 'seller_side' | 'dual' | 'listing';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_ADDRESS: AddressData = { street: '', city: '', state: '', zip: '' };
const EMPTY_PERSON: PersonData = { firstName: '', lastName: '', email: '', phone: '' };

export function emptyStep1(sessionFirstName?: string, sessionLastName?: string, sessionEmail?: string, sessionPhone?: string): Step1Data {
  return {
    sellerAgent: {
      firstName: sessionFirstName ?? '',
      lastName: sessionLastName ?? '',
      email: sessionEmail ?? '',
      phone: sessionPhone ?? '',
      licenseNumber: '',
      companyName: '',
    },
    property: {
      street: '', city: '', state: 'CA', zip: '',
      county: '', apn: '', mlsNumber: '',
      transactionType: 'residential',
    },
    seller: { ...EMPTY_PERSON, mailingAddress: { ...EMPTY_ADDRESS } },
    buyer:  { ...EMPTY_PERSON, mailingAddress: { ...EMPTY_ADDRESS } },
    buyerAgent: null,
    side: 'seller_side',
  };
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  data: Step1Data;
  onChange: (patch: Partial<Step1Data>) => void;
}

export default function Step1Parties({ data, onChange }: Props) {
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['seller-agent', 'property', 'seller']),
  );

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isOpen(id: string) {
    return openSections.has(id);
  }

  return (
    <div className="divide-y divide-gray-100">
      {/* Side selector */}
      <div className="px-6 py-4 bg-blue-50 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide">Transaction Role</p>
          <p className="text-xs text-blue-700 mt-0.5">Which side are you representing?</p>
        </div>
        <div className="flex gap-2">
          {(['seller_side', 'dual', 'listing'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ side: s })}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                data.side === s
                  ? 'bg-blue-700 border-blue-700 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400',
              )}
            >
              {s === 'seller_side' ? 'Seller Side' : s === 'dual' ? 'Dual Agency' : 'Listing Only'}
            </button>
          ))}
        </div>
      </div>

      {/* Seller Agent (You) */}
      <Section
        id="seller-agent"
        icon={<UserCheck size={16} className="text-blue-600" />}
        title="Seller Agent (You)"
        badge="Pre-filled from your profile"
        badgeColor="blue"
        isOpen={isOpen('seller-agent')}
        onToggle={() => toggleSection('seller-agent')}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required>
              <Input value={data.sellerAgent.firstName} onChange={(v) => onChange({ sellerAgent: { ...data.sellerAgent, firstName: v } })} placeholder="Jane" />
            </Field>
            <Field label="Last Name" required>
              <Input value={data.sellerAgent.lastName} onChange={(v) => onChange({ sellerAgent: { ...data.sellerAgent, lastName: v } })} placeholder="Smith" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email Address" required>
              <Input type="email" value={data.sellerAgent.email} onChange={(v) => onChange({ sellerAgent: { ...data.sellerAgent, email: v } })} placeholder="jane@realty.com" />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={data.sellerAgent.phone} onChange={(v) => onChange({ sellerAgent: { ...data.sellerAgent, phone: v } })} placeholder="(555) 000-0000" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="DRE License #">
              <Input value={data.sellerAgent.licenseNumber} onChange={(v) => onChange({ sellerAgent: { ...data.sellerAgent, licenseNumber: v } })} placeholder="01234567" />
            </Field>
            <Field label="Brokerage / Company">
              <Input value={data.sellerAgent.companyName} onChange={(v) => onChange({ sellerAgent: { ...data.sellerAgent, companyName: v } })} placeholder="Sunset Realty" />
            </Field>
          </div>
        </div>
      </Section>

      {/* Property */}
      <Section
        id="property"
        icon={<Home size={16} className="text-emerald-600" />}
        title="Property"
        isOpen={isOpen('property')}
        onToggle={() => toggleSection('property')}
      >
        <div className="space-y-4">
          <div className="flex gap-3 mb-2">
            {(['residential', 'income_property', 'commercial', 'land'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ property: { ...data.property, transactionType: t } })}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium border transition-colors',
                  data.property.transactionType === t
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white border-gray-300 text-gray-600 hover:border-emerald-400',
                )}
              >
                {t === 'income_property' ? 'Income Property' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <Field label="Street Address" required>
            <Input value={data.property.street} onChange={(v) => onChange({ property: { ...data.property, street: v } })} placeholder="123 Main St" />
          </Field>
          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-3">
              <Field label="City" required>
                <Input value={data.property.city} onChange={(v) => onChange({ property: { ...data.property, city: v } })} placeholder="Los Angeles" />
              </Field>
            </div>
            <div className="col-span-1">
              <Field label="State" required>
                <Input value={data.property.state} onChange={(v) => onChange({ property: { ...data.property, state: v.toUpperCase() } })} placeholder="CA" maxLength={2} className="uppercase" />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="ZIP" required>
                <Input value={data.property.zip} onChange={(v) => onChange({ property: { ...data.property, zip: v } })} placeholder="90001" maxLength={10} />
              </Field>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="County">
              <Input value={data.property.county} onChange={(v) => onChange({ property: { ...data.property, county: v } })} placeholder="Los Angeles" />
            </Field>
            <Field label="APN">
              <Input value={data.property.apn} onChange={(v) => onChange({ property: { ...data.property, apn: v } })} placeholder="1234-567-890" />
            </Field>
            <Field label="MLS #">
              <Input value={data.property.mlsNumber} onChange={(v) => onChange({ property: { ...data.property, mlsNumber: v } })} placeholder="SR24001234" />
            </Field>
          </div>
        </div>
      </Section>

      {/* Seller */}
      <Section
        id="seller"
        icon={<User size={16} className="text-amber-600" />}
        title="Seller"
        isOpen={isOpen('seller')}
        onToggle={() => toggleSection('seller')}
      >
        <PartyFields
          data={data.seller}
          onChange={(patch) => onChange({ seller: { ...data.seller, ...patch } })}
          showMailingAddress
          mailingAddressLabel="Seller's Mailing Address"
        />
      </Section>

      {/* Buyer */}
      <Section
        id="buyer"
        icon={<User size={16} className="text-violet-600" />}
        title="Buyer"
        isOpen={isOpen('buyer')}
        onToggle={() => toggleSection('buyer')}
      >
        <PartyFields
          data={data.buyer}
          onChange={(patch) => onChange({ buyer: { ...data.buyer, ...patch } })}
          showMailingAddress
          mailingAddressLabel="Buyer's Mailing Address"
        />
      </Section>

      {/* Buyer Agent (optional) */}
      <div>
        <button
          type="button"
          onClick={() => {
            if (!isOpen('buyer-agent')) toggleSection('buyer-agent');
            onChange({ buyerAgent: data.buyerAgent ?? { ...EMPTY_PERSON } });
          }}
          className={cn(
            'w-full flex items-center justify-between px-6 py-4 text-left transition-colors',
            isOpen('buyer-agent') ? 'bg-gray-50' : 'hover:bg-gray-50',
          )}
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
              <User size={16} className="text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Buyer Agent</p>
              <p className="text-xs text-gray-500">Optional — cooperating agent representing the buyer</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.buyerAgent === null ? (
              <span className="flex items-center gap-1 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 px-2.5 py-1 rounded-full">
                <Plus size={12} />
                Add
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ buyerAgent: null });
                    if (isOpen('buyer-agent')) toggleSection('buyer-agent');
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-red-600 border border-red-200 bg-red-50 px-2.5 py-1 rounded-full hover:bg-red-100 transition-colors"
                >
                  <X size={12} />
                  Remove
                </button>
                {isOpen('buyer-agent') ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </>
            )}
          </div>
        </button>
        {data.buyerAgent !== null && isOpen('buyer-agent') && (
          <div className="px-6 pb-6 bg-gray-50 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name">
                <Input value={data.buyerAgent.firstName} onChange={(v) => onChange({ buyerAgent: { ...data.buyerAgent!, firstName: v } })} placeholder="John" />
              </Field>
              <Field label="Last Name">
                <Input value={data.buyerAgent.lastName} onChange={(v) => onChange({ buyerAgent: { ...data.buyerAgent!, lastName: v } })} placeholder="Doe" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email">
                <Input type="email" value={data.buyerAgent.email} onChange={(v) => onChange({ buyerAgent: { ...data.buyerAgent!, email: v } })} placeholder="john@realty.com" />
              </Field>
              <Field label="Phone">
                <Input type="tel" value={data.buyerAgent.phone} onChange={(v) => onChange({ buyerAgent: { ...data.buyerAgent!, phone: v } })} placeholder="(555) 000-0000" />
              </Field>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  id: _id, icon, title, badge, badgeColor = 'gray',
  isOpen, onToggle, children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeColor?: 'blue' | 'gray';
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between px-6 py-4 text-left transition-colors',
          isOpen ? 'bg-gray-50' : 'hover:bg-gray-50',
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
            {icon}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            {badge && (
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                badgeColor === 'blue'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600',
              )}>
                {badge}
              </span>
            )}
          </div>
        </div>
        {isOpen
          ? <ChevronUp size={16} className="text-gray-400" />
          : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {isOpen && (
        <div className="px-6 pb-6 bg-gray-50 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Party fields (name + contact + optional mailing address) ─────────────────

function PartyFields({
  data, onChange, showMailingAddress, mailingAddressLabel,
}: {
  data: PartyData;
  onChange: (patch: Partial<PartyData>) => void;
  showMailingAddress?: boolean;
  mailingAddressLabel?: string;
}) {
  const [showAddress, setShowAddress] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="First Name" required>
          <Input value={data.firstName} onChange={(v) => onChange({ firstName: v })} placeholder="Alex" />
        </Field>
        <Field label="Last Name" required>
          <Input value={data.lastName} onChange={(v) => onChange({ lastName: v })} placeholder="Johnson" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Email">
          <Input type="email" value={data.email} onChange={(v) => onChange({ email: v })} placeholder="alex@example.com" />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={data.phone} onChange={(v) => onChange({ phone: v })} placeholder="(555) 000-0000" />
        </Field>
      </div>
      {showMailingAddress && (
        <>
          <button
            type="button"
            onClick={() => setShowAddress((p) => !p)}
            className="text-xs text-blue-700 hover:text-blue-800 font-medium"
          >
            {showAddress ? '− Hide mailing address' : '+ Add mailing address'}
          </button>
          {showAddress && (
            <div className="space-y-3 pt-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{mailingAddressLabel}</p>
              <Field label="Street">
                <Input value={data.mailingAddress.street} onChange={(v) => onChange({ mailingAddress: { ...data.mailingAddress, street: v } })} placeholder="123 Oak Ave" />
              </Field>
              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-3">
                  <Field label="City">
                    <Input value={data.mailingAddress.city} onChange={(v) => onChange({ mailingAddress: { ...data.mailingAddress, city: v } })} placeholder="Los Angeles" />
                  </Field>
                </div>
                <div className="col-span-1">
                  <Field label="State">
                    <Input value={data.mailingAddress.state} onChange={(v) => onChange({ mailingAddress: { ...data.mailingAddress, state: v.toUpperCase() } })} placeholder="CA" maxLength={2} className="uppercase" />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="ZIP">
                    <Input value={data.mailingAddress.zip} onChange={(v) => onChange({ mailingAddress: { ...data.mailingAddress, zip: v } })} placeholder="90001" maxLength={10} />
                  </Field>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function Input({
  value, onChange, type = 'text', placeholder, maxLength, className,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={cn(
        'w-full h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400',
        'focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600',
        'transition-colors',
        className,
      )}
    />
  );
}
