import {
  DamageEvent,
  EventType,
  GetRelatedEvents,
  HasRelatedEvent,
  HealEvent,
} from 'parser/core/Events';
import { Options } from 'parser/core/Module';
import EventLinkNormalizer, { EventLink } from 'parser/core/EventLinkNormalizer';
import SPELLS from 'common/SPELLS';
import { ATONEMENT_DAMAGE_IDS } from '../constants';

const BUFFER_MS = 500;
const ATONEMENT_DAMAGE_EVENT = 'AtonementDamageEvent';
const ATONEMENT_HEAL_EVENT = 'AtonementHealEvent';

const EVENT_LINKS: EventLink[] = [
  {
    linkRelation: ATONEMENT_DAMAGE_EVENT,
    reverseLinkRelation: ATONEMENT_HEAL_EVENT,
    linkingEventId: [SPELLS.ATONEMENT_HEAL_CRIT.id, SPELLS.ATONEMENT_HEAL_NON_CRIT.id],
    linkingEventType: EventType.Heal,
    referencedEventId: ATONEMENT_DAMAGE_IDS,
    referencedEventType: EventType.Damage,
    backwardBufferMs: BUFFER_MS,
    anyTarget: true,
    anySource: true,
    additionalCondition(linkingEvent, referencedEvent) {
      const healEvent = linkingEvent as HealEvent;
      const damageEvent = referencedEvent as DamageEvent;
      return !checkAtonementTargetsHealed(damageEvent).includes(healEvent.targetID);
    },
  },
];

export function checkAtonementTargetsHealed(damageEvent: DamageEvent): number[] {
  return getHealEvents(damageEvent).map((healEvent) => healEvent.targetID);
}

class AtonementNormalizer extends EventLinkNormalizer {
  constructor(options: Options) {
    super(options, EVENT_LINKS);
  }
}

export function hasAtonementDamageEvent(event: HealEvent): boolean {
  return HasRelatedEvent(event, ATONEMENT_DAMAGE_EVENT);
}

export function getDamageEvent(event: HealEvent) {
  return GetRelatedEvents(event, ATONEMENT_DAMAGE_EVENT)[0] as DamageEvent;
}

export function getHealEvents(event: DamageEvent) {
  return GetRelatedEvents(event, ATONEMENT_HEAL_EVENT) as HealEvent[];
}

export default AtonementNormalizer;
