import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export interface PaystackInitializeResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaystackVerifyResult {
  status: 'success' | 'failed' | 'abandoned' | 'pending';
  reference: string;
  amount: number;
  currency: string;
  paidAt: string | null;
  id: number;
}

export interface PaystackTransferRecipientResult {
  recipientCode: string;
}

export interface PaystackTransferResult {
  transferCode: string;
  status: string;
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  constructor(private readonly configService: ConfigService) {}

  private get secretKey(): string {
    return this.configService.getOrThrow<string>('paystack.secretKey');
  }

  /** Verifies the `x-paystack-signature` header against the raw request body using our secret key. */
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const hash = crypto.createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  }

  async initializeTransaction(params: {
    email: string;
    amountKobo: number;
    reference: string;
    callbackUrl?: string;
  }): Promise<PaystackInitializeResult> {
    const body = await this.request('POST', '/transaction/initialize', {
      email: params.email,
      amount: params.amountKobo,
      reference: params.reference,
      callback_url: params.callbackUrl,
    });
    return {
      authorizationUrl: body.data.authorization_url,
      accessCode: body.data.access_code,
      reference: body.data.reference,
    };
  }

  async verifyTransaction(reference: string): Promise<PaystackVerifyResult> {
    const body = await this.request('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    return {
      status: body.data.status,
      reference: body.data.reference,
      amount: body.data.amount,
      currency: body.data.currency,
      paidAt: body.data.paid_at,
      id: body.data.id,
    };
  }

  async createTransferRecipient(params: {
    name: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<PaystackTransferRecipientResult> {
    const body = await this.request('POST', '/transferrecipient', {
      type: 'nuban',
      name: params.name,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: 'NGN',
    });
    return { recipientCode: body.data.recipient_code };
  }

  async initiateTransfer(params: {
    amountKobo: number;
    recipientCode: string;
    reference: string;
    reason?: string;
  }): Promise<PaystackTransferResult> {
    const body = await this.request('POST', '/transfer', {
      source: 'balance',
      amount: params.amountKobo,
      recipient: params.recipientCode,
      reference: params.reference,
      reason: params.reason,
    });
    return { transferCode: body.data.transfer_code, status: body.data.status };
  }

  async listBanks(): Promise<Array<{ name: string; code: string }>> {
    const body = await this.request('GET', '/bank?country=nigeria&currency=NGN');
    return (body.data as Array<{ name: string; code: string }>).map((b) => ({ name: b.name, code: b.code }));
  }

  async resolveAccount(params: { accountNumber: string; bankCode: string }): Promise<{ accountName: string }> {
    const body = await this.request(
      'GET',
      `/bank/resolve?account_number=${encodeURIComponent(params.accountNumber)}&bank_code=${encodeURIComponent(params.bankCode)}`,
    );
    return { accountName: body.data.account_name };
  }

  private async request(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await response.json().catch(() => null);

    if (!response.ok || !json?.status) {
      this.logger.error(`Paystack ${method} ${path} failed: ${response.status} ${JSON.stringify(json)}`);
      throw new BadGatewayException(json?.message ?? 'Payment provider request failed');
    }

    return json;
  }
}
