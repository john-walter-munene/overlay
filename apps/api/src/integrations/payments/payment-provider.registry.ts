import type {
  PaymentMethodId,
  PaymentProvider,
} from './payment-provider.interface';

/**
 * Registry of the payment providers wired into the app (OB-06x).
 *
 * Lets a subscriber pick a payment *method* (card, Apple/Google Pay, USDC,
 * M-Pesa…) and routes it to the provider that settles it, while keeping a
 * default provider for legacy/webhook and payout flows. Kept free of Nest so
 * the method→provider routing can be unit-tested in isolation.
 */
export class PaymentProviderRegistry {
  private readonly byName = new Map<string, PaymentProvider>();
  private readonly defaultName: string;

  constructor(providers: readonly PaymentProvider[], defaultName: string) {
    this.defaultName = defaultName;
    for (const p of providers) this.byName.set(p.name, p);
    if (!this.byName.has(defaultName)) {
      throw new Error(`Default payment provider "${defaultName}" not registered`);
    }
  }

  /** The env-selected default provider (used for payouts + legacy webhooks). */
  get default(): PaymentProvider {
    return this.byName.get(this.defaultName)!;
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** Resolve a provider by name, or throw if it isn't registered. */
  get(name: string): PaymentProvider {
    const p = this.byName.get(name);
    if (!p) throw new Error(`Unknown payment provider: ${name}`);
    return p;
  }

  all(): PaymentProvider[] {
    return [...this.byName.values()];
  }

  /**
   * The provider that settles a given method, or undefined if none does. When
   * several providers settle the same method (e.g. both Stripe and Paystack
   * settle `card`), the configured **default** provider wins, so the operator's
   * chosen processor is used for its markets. Unavailable providers (missing
   * keys, no dev fallback) are skipped so a routed method can actually be paid.
   */
  forMethod(method: PaymentMethodId): PaymentProvider | undefined {
    const def = this.byName.get(this.defaultName);
    if (
      def?.capabilities.methods.includes(method) &&
      isAvailable(def)
    ) {
      return def;
    }
    return this.all().find(
      (p) => p.capabilities.methods.includes(method) && isAvailable(p),
    );
  }

  /** Every payment method enabled across all *available* registered providers. */
  methods(): PaymentMethodId[] {
    return [
      ...new Set(
        this.all()
          .filter(isAvailable)
          .flatMap((p) => [...p.capabilities.methods]),
      ),
    ];
  }
}

/** A provider is usable when it reports availability (or doesn't implement it). */
function isAvailable(p: PaymentProvider): boolean {
  return p.isAvailable?.() ?? true;
}
