export type Kind = "AGENCY" | "HOTEL" | "BUS" | "CAR";
export interface Plan {
  id: Kind;
  monthlyPaise: number;
  requestLimit: number;
  resourceLimit: number;
  commissionBps: number;
  platformBps: number;
  agencyBps: number;
  supplierBps: number;
  basis: "NET_TOTAL" | "NET_AFTER_DISCOUNT";
  revision: number;
}
export interface Business {
  id: string;
  ownerId: string;
  kind: Kind;
  name: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  registration: string;
  paymentInstructions: string;
  status: string;
  reviewReason: string;
  hotelId: string | null;
  agencyId: string | null;
  createdAt: string;
  revision: number;
}
export interface Vehicle {
  id: string;
  businessId: string;
  name: string;
  registration: string;
  capacity: number;
  pricing: "TRIP" | "KM";
  ratePaise: number;
  minKm: number;
  taxBps: number;
  policies: string;
  photos: string;
  active: number;
  revision: number;
}
export interface Agreement {
  id: string;
  version: number;
  terms: string;
  commissionBps: number;
  platformBps: number;
  agencyBps: number;
  supplierBps: number;
  basis: "NET_TOTAL" | "NET_AFTER_DISCOUNT";
  acceptedAt: string | null;
  acceptedBy: string | null;
  revision: number;
}
export interface Snapshot {
  kind: Kind;
  vehicleRevision?: number;
  quoteToken?: string;
  stay?: {
    roomId: string;
    checkIn: string;
    checkOut: string;
    rooms: number;
    adults: number;
    children: number;
  };
  policies: string;
  paymentTerms: "PAY_AT_SUPPLIER" | "HOTEL_PROVIDER";
  agreement: Agreement;
  eligible: boolean;
  hasAgency: boolean;
}
export interface Booking {
  id: string;
  businessId: string;
  requesterId: string;
  agencyId: string | null;
  requestKey: string;
  payloadHash: string;
  origin: string;
  vehicleId: string | null;
  hotelStayId: string | null;
  driverId: string | null;
  start: string;
  end: string;
  route: string;
  capacity: number;
  km: number;
  customer: string;
  phone: string;
  email: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  refundedNet: number;
  refundedTax: number;
  expense: number;
  snapshot: string;
  holdUntil: string | null;
  createdAt: string;
  revision: number;
}
export interface Subscription {
  id: string;
  status: string;
  monthlyPaise: number;
  expiresAt: string;
  reference: string;
  revision: number;
}
