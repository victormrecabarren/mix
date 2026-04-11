import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

// This route handles the rare case where the app is cold-launched
// via the mix://auth/callback deep link (e.g. on Android).
// On iOS, openAuthSessionAsync captures the redirect internally.
export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // _layout's useSession will detect the session and redirect automatically
    router.replace('/');
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
