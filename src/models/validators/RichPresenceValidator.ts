import type { RichPresence } from '../RichPresence';
import { ValidationError } from '../ErrorTypes';

/**
 * Validates Rich Presence party information
 */
export function validateRichPresenceParty(party: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!party || typeof party !== 'object') {
    errors.push({
      field: 'party',
      rule: 'object',
      message: 'Party must be an object',
      value: party
    });
    return errors;
  }
  
  // Validate optional ID
  if (party.id !== undefined && typeof party.id !== 'string') {
    errors.push({
      field: 'party.id',
      rule: 'string',
      message: 'Party ID must be a string if provided',
      value: party.id
    });
  }
  
  // Validate size array
  if (party.size !== undefined) {
    if (!Array.isArray(party.size) || party.size.length !== 2) {
      errors.push({
        field: 'party.size',
        rule: 'array_length',
        message: 'Party size must be an array with exactly 2 elements [current, max]',
        value: party.size
      });
    } else {
      const [current, max] = party.size;
      if (!Number.isInteger(current) || current < 0) {
        errors.push({
          field: 'party.size[0]',
          rule: 'positive_integer',
          message: 'Current party size must be a non-negative integer',
          value: current
        });
      }
      if (!Number.isInteger(max) || max < 1) {
        errors.push({
          field: 'party.size[1]',
          rule: 'positive_integer',
          message: 'Max party size must be a positive integer',
          value: max
        });
      }
      if (Number.isInteger(current) && Number.isInteger(max) && current > max) {
        errors.push({
          field: 'party.size',
          rule: 'logical',
          message: 'Current party size cannot be greater than max party size',
          value: party.size
        });
      }
    }
  }
  
  return errors;
}

/**
 * Validates Rich Presence secrets information
 */
export function validateRichPresenceSecrets(secrets: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!secrets || typeof secrets !== 'object') {
    errors.push({
      field: 'secrets',
      rule: 'object',
      message: 'Secrets must be an object',
      value: secrets
    });
    return errors;
  }
  
  // Validate optional string fields
  const stringFields = ['join', 'spectate', 'match'];
  for (const field of stringFields) {
    if (secrets[field] !== undefined && typeof secrets[field] !== 'string') {
      errors.push({
        field: `secrets.${field}`,
        rule: 'string',
        message: `${field} secret must be a string if provided`,
        value: secrets[field]
      });
    }
  }
  
  return errors;
}

/**
 * Validates complete Rich Presence object
 */
export function validateRichPresence(richPresence: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!richPresence || typeof richPresence !== 'object') {
    errors.push({
      field: 'richPresence',
      rule: 'required_object',
      message: 'Rich Presence must be an object',
      value: richPresence
    });
    return errors;
  }
  
  // Validate optional string fields
  const optionalStringFields = [
    'applicationId', 'details', 'state', 
    'largeImageKey', 'largeImageText', 
    'smallImageKey', 'smallImageText'
  ];
  
  for (const field of optionalStringFields) {
    if (richPresence[field] !== undefined && typeof richPresence[field] !== 'string') {
      errors.push({
        field: field,
        rule: 'string',
        message: `${field} must be a string if provided`,
        value: richPresence[field]
      });
    }
  }
  
  // Validate optional boolean fields
  if (richPresence.instance !== undefined && typeof richPresence.instance !== 'boolean') {
    errors.push({
      field: 'instance',
      rule: 'boolean',
      message: 'Instance must be a boolean if provided',
      value: richPresence.instance
    });
  }
  
  // Validate optional number fields
  if (richPresence.flags !== undefined && !Number.isInteger(richPresence.flags)) {
    errors.push({
      field: 'flags',
      rule: 'integer',
      message: 'Flags must be an integer if provided',
      value: richPresence.flags
    });
  }
  
  // Validate nested objects
  if (richPresence.party !== undefined) {
    const partyErrors = validateRichPresenceParty(richPresence.party);
    partyErrors.forEach(error => {
      errors.push({
        ...error,
        field: error.field === 'party' ? 'party' : `party.${error.field.replace('party.', '')}`
      });
    });
  }
  
  if (richPresence.secrets !== undefined) {
    const secretsErrors = validateRichPresenceSecrets(richPresence.secrets);
    secretsErrors.forEach(error => {
      errors.push({
        ...error,
        field: error.field === 'secrets' ? 'secrets' : `secrets.${error.field.replace('secrets.', '')}`
      });
    });
  }
  
  return errors;
}

/**
 * Type guard for RichPresence
 */
export function isValidRichPresence(richPresence: any): richPresence is RichPresence {
  return validateRichPresence(richPresence).length === 0;
}