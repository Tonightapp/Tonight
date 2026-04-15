import AsyncStorage from '@react-native-async-storage/async-storage';

export type Ticket = {
  ref: string;
  eventId: number;
  eventTitle: string;
  venue: string;
  city: string;
  date: string;
  img: string | null;
  ticketType: 'Entry' | 'Guestlist';
  qty: number;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  status: 'valid' | 'used' | 'checked_in';
  issuedAt: string;
  arrivedAt?: string;
};

const TICKETS_KEY = '@tonight_tickets';
const FAVOURITES_KEY = '@tonight_favourites';

export async function getTickets(): Promise<Ticket[]> {
  try {
    const raw = await AsyncStorage.getItem(TICKETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Ticket[];
  } catch {
    return [];
  }
}

export async function saveTicket(tk: Ticket): Promise<void> {
  try {
    const existing = await getTickets();
    const idx = existing.findIndex((t) => t.ref === tk.ref);
    if (idx >= 0) {
      existing[idx] = tk;
    } else {
      existing.unshift(tk);
    }
    await AsyncStorage.setItem(TICKETS_KEY, JSON.stringify(existing));
  } catch {
    // silently fail — ticket is already shown on screen
  }
}

export async function getFavourites(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVOURITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as number[];
  } catch {
    return [];
  }
}

export async function toggleFavourite(id: number): Promise<number[]> {
  try {
    const current = await getFavourites();
    let updated: number[];
    if (current.includes(id)) {
      updated = current.filter((fid) => fid !== id);
    } else {
      updated = [...current, id];
    }
    await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function genSerial(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `TN-${seg()}-${seg()}-${seg()}`;
}
