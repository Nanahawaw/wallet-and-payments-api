import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PaystackService } from '../src/payments/paystack/paystack.service';
import { DepositsService } from '../src/deposits/deposits.service';
import { DepositRequest, DepositStatus } from '../src/deposits/entities/deposit-request.entity';

/**
 * Exercises the three scenarios the brief says grading is based on:
 *  1. the same webhook event delivered twice,
 *  2. two concurrent requests racing a balance that only covers one,
 *  3. a deposit that never gets confirmed.
 * All calls to Paystack's actual HTTP API are stubbed - these tests only need
 * to prove our own signature verification, locking and reconciliation logic,
 * not Paystack's sandbox availability.
 */
describe('Wallet integrity (e2e)', () => {
  let app: INestApplication;
  let paystackService: PaystackService;
  let configService: ConfigService;
  let depositsService: DepositsService;
  let depositRepository: Repository<DepositRequest>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    paystackService = moduleRef.get(PaystackService);
    configService = moduleRef.get(ConfigService);
    depositsService = moduleRef.get(DepositsService);
    depositRepository = moduleRef.get(getRepositoryToken(DepositRequest));
  });

  afterAll(async () => {
    await app.close();
  });

  function unique(label: string) {
    const suffix = `${Date.now()}`.slice(-8) + Math.floor(Math.random() * 1000);
    return `${label}${suffix}`.slice(0, 30);
  }

  async function registerUser(label: string) {
    const tag = unique(label);
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `${tag}@test.local`, username: tag, password: 'password123' })
      .expect(201);
    return res.body as { accessToken: string; user: { id: string; username: string } };
  }

  async function creditViaWebhook(reference: string, amountKobo: number) {
    const secret = configService.getOrThrow<string>('paystack.secretKey');
    const body = JSON.stringify({
      event: 'charge.success',
      data: { id: Math.floor(Math.random() * 1e9), reference, amount: amountKobo, status: 'success' },
    });
    const signature = crypto.createHmac('sha512', secret).update(body).digest('hex');

    await request(app.getHttpServer())
      .post('/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(body)
      .expect(200);

    // webhook processing happens on a BullMQ worker in a separate tick
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return { body, signature };
  }

  it('processes a webhook delivered twice exactly once (idempotent deposit credit)', async () => {
    jest
      .spyOn(paystackService, 'initializeTransaction')
      .mockResolvedValue({ authorizationUrl: 'https://example.test/pay', accessCode: 'code', reference: 'ignored' });

    const user = await registerUser('webhookuser');
    const depositRes = await request(app.getHttpServer())
      .post('/deposits')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ amount: 250000 })
      .expect(201);
    const reference = depositRes.body.reference as string;

    const { body, signature } = await creditViaWebhook(reference, 250000);

    // fire the exact same delivery again
    await request(app.getHttpServer())
      .post('/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(body)
      .expect(200);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const walletRes = await request(app.getHttpServer())
      .get('/wallets/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(walletRes.body.balance).toBe(250000);

    const txRes = await request(app.getHttpServer())
      .get('/wallets/me/transactions')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(txRes.body.total).toBe(1);
  }, 15000);

  it('lets exactly one of two concurrent transfers succeed when the balance only covers one', async () => {
    jest
      .spyOn(paystackService, 'initializeTransaction')
      .mockResolvedValue({ authorizationUrl: 'https://example.test/pay', accessCode: 'code', reference: 'ignored' });

    const sender = await registerUser('sender');
    const recipient = await registerUser('recipient');

    const depositRes = await request(app.getHttpServer())
      .post('/deposits')
      .set('Authorization', `Bearer ${sender.accessToken}`)
      .send({ amount: 500000 })
      .expect(201);
    await creditViaWebhook(depositRes.body.reference, 500000);

    const [r1, r2] = await Promise.all([
      request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ recipientUsername: recipient.user.username, amount: 400000 }),
      request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ recipientUsername: recipient.user.username, amount: 400000 }),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 422]);

    const senderWallet = await request(app.getHttpServer())
      .get('/wallets/me')
      .set('Authorization', `Bearer ${sender.accessToken}`)
      .expect(200);
    const recipientWallet = await request(app.getHttpServer())
      .get('/wallets/me')
      .set('Authorization', `Bearer ${recipient.accessToken}`)
      .expect(200);

    expect(senderWallet.body.balance).toBe(100000);
    expect(recipientWallet.body.balance).toBe(400000);
  }, 15000);

  it('expires a deposit that never gets confirmed without ever crediting the wallet', async () => {
    jest
      .spyOn(paystackService, 'initializeTransaction')
      .mockResolvedValue({ authorizationUrl: 'https://example.test/pay', accessCode: 'code', reference: 'ignored' });
    jest
      .spyOn(paystackService, 'verifyTransaction')
      .mockResolvedValue({ status: 'abandoned', reference: 'ignored', amount: 0, currency: 'NGN', paidAt: null, id: 0 });

    const user = await registerUser('neverconfirmed');
    const depositRes = await request(app.getHttpServer())
      .post('/deposits')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ amount: 150000 })
      .expect(201);
    const reference = depositRes.body.reference as string;

    await depositRepository.update({ reference }, { expiresAt: new Date(Date.now() - 60 * 60 * 1000) });

    const sweepResult = await depositsService.sweepExpiredDeposits();
    expect(sweepResult.expired).toBeGreaterThanOrEqual(1);

    const statusRes = await request(app.getHttpServer())
      .get(`/deposits/${reference}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(statusRes.body.status).toBe(DepositStatus.EXPIRED);

    const walletRes = await request(app.getHttpServer())
      .get('/wallets/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(walletRes.body.balance).toBe(0);
  }, 15000);
});
