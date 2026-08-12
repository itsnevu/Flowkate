/** One selectable entry in the model dropdowns: a model offered by a configured provider. */
export interface AvailableModel {
  provider: string;
  providerName: string;
  model: string;
}

/**
 * Sampling knobs stored per agent. A type alias rather than an interface: the storage layer
 * takes these as an index-signature record, which only object literal types satisfy.
 */
export type ModelParameters = {
  temperature: number;
  topP: number;
};

/** How hard an OpenAI reasoning model should think before answering. */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

/** What the provider card's right-hand key does in its current state. */
export interface ProviderButtonProps {
  variant: 'danger' | 'primary';
  children: string;
  disabled: boolean;
}
