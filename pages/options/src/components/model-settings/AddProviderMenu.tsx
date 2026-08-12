import { ProviderTypeEnum, getDefaultDisplayNameFromProviderId } from '@extension/storage';
import { t } from '@extension/i18n';
import { KEY_PRIMARY } from './styles';

interface AddProviderMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  /** providers already saved, hidden from the menu so they cannot be added twice */
  providersFromStorage: Set<string>;
  /** providers added but not yet saved, hidden for the same reason */
  modifiedProviders: Set<string>;
  onSelect: (providerType: string) => void;
}

/** Shared geometry for the menu rows; the surface only changes on hover. */
const MENU_ITEM =
  'flex w-full items-center rounded-soft px-3 py-2.5 text-left text-sm font-medium text-ink transition-all duration-150 ease-press hover:bg-canvas-sunk hover:shadow-neu-inset-sm';

/**
 * The "add a provider" key and the sheet it opens. Azure is the one type that stays listed
 * forever: several Azure resources can be configured side by side, each with its own endpoint.
 */
export const AddProviderMenu = ({
  isOpen,
  onToggle,
  providersFromStorage,
  modifiedProviders,
  onSelect,
}: AddProviderMenuProps) => (
  <div className="provider-selector-container relative">
    <button type="button" onClick={onToggle} className={`${KEY_PRIMARY} w-full`}>
      <span className="text-base leading-none">+</span>
      <span>{t('options_models_addNewProvider')}</span>
    </button>

    {isOpen && (
      <div className="animate-rise absolute z-10 mt-2 w-full overflow-hidden rounded-slab bg-canvas-raised p-1.5 shadow-neu-lg">
        {/* Map through provider types to create buttons */}
        {Object.values(ProviderTypeEnum)
          // Allow Azure to appear multiple times, but filter out other already added providers
          .filter(
            type =>
              type === ProviderTypeEnum.AzureOpenAI || // Always show Azure
              (type !== ProviderTypeEnum.CustomOpenAI &&
                !providersFromStorage.has(type) &&
                !modifiedProviders.has(type)),
          )
          .map(type => (
            <button key={type} type="button" className={MENU_ITEM} onClick={() => onSelect(type)}>
              {getDefaultDisplayNameFromProviderId(type)}
            </button>
          ))}

        {/* Custom provider button (always shown) */}
        <button type="button" className={MENU_ITEM} onClick={() => onSelect(ProviderTypeEnum.CustomOpenAI)}>
          {t('options_models_providers_openaiCompatible')}
        </button>
      </div>
    )}
  </div>
);
