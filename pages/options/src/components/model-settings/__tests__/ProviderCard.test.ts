import { describe, it, expect, vi } from 'vitest';
import { ProviderTypeEnum } from '@extension/storage';
import { ProviderCard } from '../ProviderCard';
import type { ReactElement } from 'react';
import type { ProviderConfig } from '@extension/storage';

/**
 * `ProviderCard` is a plain function of its props with no hooks, so it can be called directly and
 * the element it returns inspected as data - the same approach `AgentModelCard.test.ts` takes, and
 * for the same reason: neither `jsdom` nor a renderer is a dependency of this repo.
 */
function renderRoot(providerType: ProviderTypeEnum, isNewProvider = false): ReactElement {
  const config: ProviderConfig = {
    type: providerType,
    name: 'OpenRouter',
    apiKey: '',
    modelNames: ['google/gemini-2.5-flash'],
  } as ProviderConfig;

  return ProviderCard({
    providerId: 'openrouter',
    providerConfig: config,
    providerType,
    isNewProvider,
    buttonProps: { variant: 'primary', children: 'Save', disabled: false },
    apiKeyVisible: false,
    modelInput: '',
    onNameChange: vi.fn(),
    onApiKeyChange: vi.fn(),
    onToggleApiKeyVisibility: vi.fn(),
    onModelInputChange: vi.fn(),
    onModelInputKeyDown: vi.fn(),
    onAddModel: vi.fn(),
    onRemoveModel: vi.fn(),
    onAddAzureDeployment: vi.fn(),
    onRemoveAzureDeployment: vi.fn(),
    onAzureApiVersionChange: vi.fn(),
    onCancel: vi.fn(),
    onPrimaryAction: vi.fn(),
  }) as ReactElement;
}

function rootClass(element: ReactElement): string {
  return (element.props as { className?: string }).className ?? '';
}

describe('ProviderCard stacking', () => {
  /*
    The regression this pins: `animate-rise` carries `animation-fill-mode: both`, so a newly added
    card keeps `transform: translateY(0)` after the animation and therefore keeps a stacking
    context. Without a z-index of its own, the card painted under the positioned Add New Provider
    menu that follows it, and took the OpenRouter model list down with it.
  */
  it.each([[ProviderTypeEnum.OpenRouter], [ProviderTypeEnum.OpenAI], [ProviderTypeEnum.Ollama]])(
    'lifts a %s card above later siblings while something inside it has focus',
    providerType => {
      const className = rootClass(renderRoot(providerType));

      expect(className).toContain('relative');
      expect(className).toContain('focus-within:z-30');
    },
  );

  // It has to drop back down, or the Add New Provider menu would open behind the cards instead.
  it('sits at z-0 when nothing inside it is focused', () => {
    expect(rootClass(renderRoot(ProviderTypeEnum.OpenRouter))).toContain('z-0');
  });

  it('keeps the lift on a freshly added card, which is the one that animates', () => {
    const className = rootClass(renderRoot(ProviderTypeEnum.OpenRouter, true));

    expect(className).toContain('animate-rise');
    expect(className).toContain('focus-within:z-30');
  });
});
