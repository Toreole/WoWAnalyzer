import SPELLS from 'common/SPELLS';
import Analyzer from 'Parser/Core/Analyzer';
import Combatants from 'Parser/Core/Modules/Combatants';
import { GIFT_OF_THE_OX_SPELLS } from '../../Constants';

const PURIFY_BASE = 0.4;
const ELUSIVE_DANCE_PURIFY = 0.2;
const STAGGER_TICKS = 20;
const T20_4PC_PURIFY = 0.05;
const debug = false;

export const EVENT_STAGGER_POOL_ADDED = 'addstagger';
export const EVENT_STAGGER_POOL_REMOVED = 'removestagger';

/**
 * Fabricate events corresponding to stagger pool updates. Each stagger
 * tick, purify, and stagger absorb generates one event.
 */
class StaggerFabricator extends Analyzer {
  static dependencies = {
    combatants: Combatants,
  };

  // causes an orb consumption to clear 5% of stagger
  _hasTier20_4pc = false;
  _staggerPool = 0;
  _lastMelee = null;

  on_initialized() {
    const player = this.combatants.selected;
    this._hasQuickSipTrait = player.traitsBySpellId[SPELLS.QUICK_SIP.id] > 0;
    this._hasTier20_4pc = player.hasBuff(SPELLS.XUENS_BATTLEGEAR_4_PIECE_BUFF_BRM.id);
  }

  get purifyPercentage() {
    const player = this.combatants.selected;
    let pct = PURIFY_BASE;
    if (player.hasTalent(SPELLS.ELUSIVE_DANCE_TALENT.id)) {
      // elusive dance clears an extra 20% of staggered damage
      pct += ELUSIVE_DANCE_PURIFY;
    }
    return pct;
  }

  get staggerPool() {
    return this._staggerPool;
  }

  on_toPlayer_absorbed(event) {
    if (event.ability.guid !== SPELLS.STAGGER.id) {
      return;
    }
    if (event.extraAbility.guid === SPELLS.SPIRIT_LINK_TOTEM_REDISTRIBUTE.id) {
      return;
    }
    const amount = event.amount + (event.absorbed || 0);
    this._staggerPool += amount;
    debug && console.log("triggering stagger pool update due to absorb");
    this.owner.fabricateEvent(this._fab(EVENT_STAGGER_POOL_ADDED, event, amount), event);
  }

  on_toPlayer_damage(event) {
    if (event.ability.guid === SPELLS.MELEE.id) {
      this._lastMelee = event;
      return;
    }
    if (event.ability.guid !== SPELLS.STAGGER_TAKEN.id) {
      return;
    }
    const amount = event.amount + (event.absorbed || 0);

    // fabricate absorb events for melee attacks. these are currently
    // bugged in BFA but existed in Legion.
    //
    // There is ONE edge case that can cause errors to accumulate: if
    // the sequence is MELEE -> PURIFY -> STAGGER TICK then the purify
    // and melee absorb will be shown as the wrong amounts, but the
    // stagger pool shouldn't drift because the absorb (aka damage
    // added) will be missing the amount that was purified.
    if(this._lastMelee) {
      const amountAbsorbed = STAGGER_TICKS * amount - this._staggerPool;
      this.owner.fabricateEvent(this._fabMelee(this._lastMelee, amountAbsorbed), event);
      this._lastMelee = null;
    }

    this._staggerPool -= amount;
    // sometimes a stagger tick is recorded immediately after death.
    // this ensures we don't go into negative stagger
    this._staggerPool = Math.max(this._staggerPool, 0);
    debug && console.log("triggering stagger pool update due to stagger tick");
    this.owner.fabricateEvent(this._fab(EVENT_STAGGER_POOL_REMOVED, event, amount), event);
  }

  on_byPlayer_cast(event) {
    if (event.ability.guid !== SPELLS.PURIFYING_BREW.id) {
      return;
    }
    const amount = this._staggerPool * this.purifyPercentage;
    this._staggerPool -= amount;
    debug && console.log("triggering stagger pool update due to purify");
    this.owner.fabricateEvent(this._fab(EVENT_STAGGER_POOL_REMOVED, event, amount), event);
  }

  on_toPlayer_death(event) {
    const amount = this._staggerPool;
    this._staggerPool = 0;
    this.owner.fabricateEvent(this._fab(EVENT_STAGGER_POOL_REMOVED, event, amount), event);
  }

  on_toPlayer_heal(event) {
    if (!this._hasTier20_4pc || !GIFT_OF_THE_OX_SPELLS.includes(event.ability.guid)) {
      return;
    }
    const amount = this._staggerPool * T20_4PC_PURIFY;
    this._staggerPool -= amount;
    debug && console.log("triggering stagger pool update due to T20 4pc");
    this.owner.fabricateEvent(this._fab(EVENT_STAGGER_POOL_REMOVED, event, amount), event);
  }

  _fab(type, reason, amount) {
    return {
      timestamp: reason.timestamp,
      type: type,
      amount: amount,
      newPooledDamage: this._staggerPool,
      _reason: reason,
    };
  }

  _fabMelee(meleeEvent, amountAbsorbed) {
    return {
      timestamp: meleeEvent.timestamp,
      type: "absorbed",
      amount: amountAbsorbed,
      ability: {
        guid: SPELLS.STAGGER.id,
        name: SPELLS.STAGGER.name,
      },
      extraAbility: meleeEvent.ability,
      sourceID: meleeEvent.targetID,
      targetID: meleeEvent.targetID,
      sourceIsFriendly: true,
      targetIsFriendly: true,
      __fabricatedBy: "stagger_melee",
    };
  }
}

export default StaggerFabricator;
