type OnboardingShape = {
  name: string | null | undefined;
  profile: {
    cpfEncrypted: string | null;
    phoneE164: string | null;
    heightCm: number | null;
    weightKg?: unknown;
  } | null;
  address: {
    postalCode: string | null;
    street: string | null;
    number: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
  } | null;
};

export function isOnboardingComplete(user: OnboardingShape) {
  return Boolean(
    user.name &&
      user.profile?.cpfEncrypted &&
      user.profile.phoneE164 &&
      user.profile.heightCm &&
      user.profile.weightKg &&
      user.address?.postalCode &&
      user.address.street &&
      user.address.number &&
      user.address.district &&
      user.address.city &&
      user.address.state &&
      user.address.country,
  );
}
