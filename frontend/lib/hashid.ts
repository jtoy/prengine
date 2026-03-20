import crypto from 'crypto'

/**
 * Generate a random, unguessable hash for use as a share identifier.
 * Uses crypto.randomBytes so IDs can't be enumerated or guessed.
 */
export function generateShareHash(length: number = 16): string {
  return crypto.randomBytes(length).toString('hex').slice(0, length)
}
