# Dutch Translation System for RoboRail Assistant

This is a simple translation system for the RoboRail Assistant MVP, focused on translating key UI elements to Dutch for better user experience.

## Usage

### Import the translation function
```typescript
import { t } from '@/lib/translations/dutch';
```

### Use in components
```typescript
// Static translations
<span>{t('new_chat')}</span>  // "Nieuwe Chat"
<span>{t('documents')}</span> // "Documenten"

// Dynamic text replacement
import { translateDynamic } from '@/lib/translations/dutch';
translateDynamic('New Chat'); // "Nieuwe Chat"
```

### Using the hook (optional)
```typescript
import { useDutchTranslation } from '@/hooks/use-dutch-translation';

function MyComponent() {
  const { t, translateText } = useDutchTranslation();
  
  return <span>{t('upload')}</span>;
}
```

## Translation Strategy

- **UI Elements**: Navigation, buttons, labels → Dutch
- **Technical Terms**: RoboRail-specific terms (PMAC, calibration) → Keep in English
- **Mixed Content**: Use Dutch for user-facing text, English for technical accuracy

## Available Translations

Key translations include:
- `new_chat` → "Nieuwe Chat"
- `documents` → "Documenten"
- `upload` → "Uploaden"
- `search` → "Zoeken"
- `loading` → "Laden"
- `processing` → "Verwerken"
- `sign_out` → "Uitloggen"

## Adding New Translations

Add entries to the `translations` object in `dutch.ts`:

```typescript
export const translations = {
  // ... existing translations
  'my_new_key': 'Mijn Nederlandse Tekst',
};
```

## Future Enhancements

This MVP approach can be extended with:
- Full i18n library integration (react-i18next)
- Language switching capability
- Context-aware translations
- Pluralization rules
- Date/time localization