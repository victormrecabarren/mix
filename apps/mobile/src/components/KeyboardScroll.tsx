import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import type { ComponentProps } from 'react';

type Props = ComponentProps<typeof KeyboardAwareScrollView>;

/**
 * Drop-in replacement for ScrollView that automatically scrolls focused
 * TextInputs above the keyboard. Use this on any screen or modal that
 * contains text inputs so keyboard handling is consistent everywhere.
 */
export function KeyboardScroll({ keyboardDismissMode = 'interactive', extraScrollHeight = 100, keyboardShouldPersistTaps = 'handled', ...props }: Props) {
  return (
    <KeyboardAwareScrollView
      keyboardDismissMode={keyboardDismissMode}
      extraScrollHeight={extraScrollHeight}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    />
  );
}
