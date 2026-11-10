import { appConversations } from '../conversations/app-conversations';
import {
  defaultFootprintFactors,
  type Footprint,
  type FootprintFactors,
  footprintOf,
} from './footprint';

/**
 * The Footprint factors every Footprint is computed with: the one place
 * that supplies them (ADR 0050).
 */
export function footprintFactors(): FootprintFactors {
  return defaultFootprintFactors;
}

/** Conversation `id`'s estimated Footprint, computed when read (ADR 0050). */
export function conversationFootprint(id: number): Footprint {
  return footprintOf(appConversations().usage(id), footprintFactors());
}
