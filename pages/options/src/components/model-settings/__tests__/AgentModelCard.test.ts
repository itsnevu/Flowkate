import { describe, it, expect, vi } from 'vitest';
import { AgentNameEnum } from '@extension/storage';
import { AgentModelCard } from '../AgentModelCard';
import type { ReactElement, ReactNode } from 'react';
import type { AvailableModel, ModelParameters, ReasoningEffort } from '../types';

/**
 * `AgentModelCard` is a plain function of its props with no hooks, so it can be called directly
 * and its returned element tree inspected as data. That keeps these assertions free of a DOM
 * implementation and of a renderer — neither `jsdom` nor `@testing-library/react` is a
 * dependency of this repo, and the invariants below do not need one.
 */
function isElement(node: unknown): node is ReactElement {
  return typeof node === 'object' && node !== null && 'type' in node && 'props' in node;
}

/** Every element in the tree whose tag matches, depth-first. */
function findAll(node: ReactNode, tag: string): ReactElement[] {
  const found: ReactElement[] = [];
  const visit = (current: unknown) => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isElement(current)) return;
    if (current.type === tag) found.push(current);
    visit((current.props as { children?: ReactNode }).children);
  };
  visit(node);
  return found;
}

const MODELS: AvailableModel[] = [
  { provider: 'openai', providerName: 'OpenAI', model: 'gpt-4o' },
  { provider: 'openai', providerName: 'OpenAI', model: 'gpt-5' },
];

const PARAMETERS: ModelParameters = { temperature: 0.4, topP: 0.001 };

function render(overrides: { selectedModel: string; reasoningEffort?: ReasoningEffort }) {
  return AgentModelCard({
    agentName: AgentNameEnum.Navigator,
    availableModels: MODELS,
    parameters: PARAMETERS,
    reasoningEffort: undefined,
    onModelChange: vi.fn(),
    onParameterChange: vi.fn(),
    onReasoningEffortChange: vi.fn(),
    ...overrides,
  });
}

/** The reasoning select, identified by the id the label points at. */
function reasoningSelect(tree: ReactNode): ReactElement | undefined {
  return findAll(tree, 'select').find(element => String(element.props.id).endsWith('-reasoning-effort'));
}

const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high'] as const;

// Compile-time half of the guard below: if `ReasoningEffort` gains or loses a member without this
// list following, `pnpm type-check` fails on one of these two aliases.
type Extends<A extends B, B> = A;
type _EveryListedValueIsInTheUnion = Extends<(typeof REASONING_EFFORTS)[number], ReasoningEffort>;
type _EveryUnionMemberIsListed = Extends<ReasoningEffort, (typeof REASONING_EFFORTS)[number]>;

describe('AgentModelCard reasoning effort select', () => {
  /**
   * Regression guard. An option once carried the value `'minimal/none'`, which is not in the
   * `ReasoningEffort` union and is not a value any provider accepts — the select stores whatever
   * the option carries and it is forwarded verbatim as `reasoning_effort`. The 'minimal' -> 'none'
   * translation for gpt-5.1 belongs in the background, not in the option value.
   */
  it('offers only values that are members of the ReasoningEffort union', () => {
    const select = reasoningSelect(render({ selectedModel: 'openai>gpt-5' }));
    expect(select).toBeDefined();

    const values = findAll(select, 'option').map(option => option.props.value);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(REASONING_EFFORTS).toContain(value);
    }
  });

  it('offers every member of the union, so no effort level is unreachable', () => {
    const select = reasoningSelect(render({ selectedModel: 'openai>gpt-5' }));
    const values = findAll(select, 'option').map(option => option.props.value);
    expect([...values].sort()).toEqual([...REASONING_EFFORTS].sort());
  });

  /**
   * The other half of the same bug: with an option value that no default could match, the select
   * rendered blank for a freshly configured agent. Its current value must always name an option.
   */
  it('falls back to a value one of its own options carries', () => {
    for (const agentName of Object.values(AgentNameEnum)) {
      const tree = AgentModelCard({
        agentName,
        availableModels: MODELS,
        selectedModel: 'openai>gpt-5',
        parameters: PARAMETERS,
        reasoningEffort: undefined,
        onModelChange: vi.fn(),
        onParameterChange: vi.fn(),
        onReasoningEffortChange: vi.fn(),
      });
      const select = reasoningSelect(tree);
      const values = findAll(select, 'option').map(option => option.props.value);
      expect(values).toContain(select?.props.value);
    }
  });

  it('keeps a stored effort selected', () => {
    const select = reasoningSelect(render({ selectedModel: 'openai>gpt-5', reasoningEffort: 'high' }));
    expect(select?.props.value).toBe('high');
  });
});

describe('AgentModelCard knob visibility', () => {
  const hasInput = (tree: ReactNode, idSuffix: string) =>
    findAll(tree, 'input').some(element => String(element.props.id).endsWith(idSuffix));

  it('shows temperature and top-p for an ordinary chat model, and no effort select', () => {
    const tree = render({ selectedModel: 'openai>gpt-4o' });
    expect(hasInput(tree, '-temperature')).toBe(true);
    expect(hasInput(tree, '-topP')).toBe(true);
    expect(reasoningSelect(tree)).toBeUndefined();
  });

  // Reasoning models take an effort level instead of sampling knobs.
  it('swaps the sliders for the effort select on a reasoning model', () => {
    const tree = render({ selectedModel: 'openai>o3' });
    expect(hasInput(tree, '-temperature')).toBe(false);
    expect(hasInput(tree, '-topP')).toBe(false);
    expect(reasoningSelect(tree)).toBeDefined();
  });

  // gpt-5-chat is not a reasoning model, so it keeps the sliders.
  it('treats gpt-5-chat as an ordinary chat model', () => {
    const tree = render({ selectedModel: 'openai>gpt-5-chat-latest' });
    expect(hasInput(tree, '-temperature')).toBe(true);
    expect(reasoningSelect(tree)).toBeUndefined();
  });

  // Anthropic rejects temperature and top-p in the same request.
  it('offers temperature but not top-p for an Anthropic model', () => {
    const tree = render({ selectedModel: 'anthropic>claude-sonnet-4-5' });
    expect(hasInput(tree, '-temperature')).toBe(true);
    expect(hasInput(tree, '-topP')).toBe(false);
  });

  it('shows no knobs at all until a model is chosen', () => {
    const tree = render({ selectedModel: '' });
    expect(hasInput(tree, '-temperature')).toBe(false);
    expect(hasInput(tree, '-topP')).toBe(false);
    expect(reasoningSelect(tree)).toBeUndefined();
  });
});

describe('AgentModelCard model select', () => {
  it('lists each available model under the `provider>model` value the card stores', () => {
    const tree = render({ selectedModel: '' });
    const select = findAll(tree, 'select').find(element => String(element.props.id).endsWith('-model'));
    const values = findAll(select, 'option').map(option => option.props.value);
    expect(values).toEqual(['', 'openai>gpt-4o', 'openai>gpt-5']);
  });

  it('disables the select when no provider offers a model', () => {
    const tree = AgentModelCard({
      agentName: AgentNameEnum.Planner,
      availableModels: [],
      selectedModel: '',
      parameters: PARAMETERS,
      reasoningEffort: undefined,
      onModelChange: vi.fn(),
      onParameterChange: vi.fn(),
      onReasoningEffortChange: vi.fn(),
    });
    const select = findAll(tree, 'select').find(element => String(element.props.id).endsWith('-model'));
    expect(select?.props.disabled).toBe(true);
  });
});
