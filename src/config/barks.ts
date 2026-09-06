/**
 * Guard bark lines (Phase 21). One is picked at random each time a guard
 * changes state, and shown above their head for a moment. Copy, not code:
 * add, cut or rewrite lines here and nothing else changes. Keep them short,
 * dry and British; the guards are bored contractors, not soldiers.
 */
export type BarkEvent =
  /** PATROL to CURIOUS: something was heard or half seen. */
  | 'curious'
  /** Any state to ALERT: the player has been made. */
  | 'alert'
  /** ALERT back to CURIOUS: lost sight, still looking. */
  | 'lostSight'
  /** CURIOUS back to PATROL: gave up. */
  | 'giveUp'
  /** The guard has radioed the building: the site alert level went up. */
  | 'radio';

export const BARKS: Record<BarkEvent, readonly string[]> = {
  curious: [
    'Hm?',
    'What was that?',
    'Hello?',
    'Who’s there?',
    'Did you hear that?',
    'Someone about?',
  ],
  alert: [
    'Oi! Stop there!',
    'You! Stay where you are!',
    'Security! Don’t move!',
    'Got you!',
    'Hey! Visitor pass?',
  ],
  lostSight: [
    'Where did they go?',
    'Lost them...',
    'Come out, come on.',
    'Must be round here somewhere.',
  ],
  giveUp: [
    'Must’ve been nothing.',
    'Pipes, probably.',
    'Back to it, then.',
    'Not paid enough for this.',
    'Probably the cleaners.',
  ],
  radio: [
    'Control, we’ve got an intruder.',
    'All units, unauthorised person on site.',
    'Control, lock it down.',
  ],
};
