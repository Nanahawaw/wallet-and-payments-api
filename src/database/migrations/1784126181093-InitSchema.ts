import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1784126181093 implements MigrationInterface {
    name = 'InitSchema1784126181093'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "wallets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "balance" bigint NOT NULL DEFAULT '0', "currency" character varying(3) NOT NULL DEFAULT 'NGN', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "REL_92558c08091598f7a4439586cd" UNIQUE ("user_id"), CONSTRAINT "CHK_wallet_balance_non_negative" CHECK ("balance" >= 0), CONSTRAINT "PK_8402e5df5a30a229380e83e4f7e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_92558c08091598f7a4439586cd" ON "wallets"  ("user_id") `);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255) NOT NULL, "username" character varying(50) NOT NULL, "password_hash" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users"  ("email") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON "users"  ("username") `);
        await queryRunner.query(`CREATE TYPE "public"."ledger_entries_type_enum" AS ENUM('DEPOSIT', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL', 'TRANSFER_IN', 'TRANSFER_OUT')`);
        await queryRunner.query(`CREATE TABLE "ledger_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "wallet_id" uuid NOT NULL, "type" "public"."ledger_entries_type_enum" NOT NULL, "amount" bigint NOT NULL, "balance_after" bigint NOT NULL, "reference" character varying(100) NOT NULL, "related_entry_id" uuid, "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6efcb84411d3f08b08450ae75d5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_bb5cd6d7046b98d8faabe9c18f" ON "ledger_entries"  ("wallet_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e65825ccc890b273369f21ec2f" ON "ledger_entries"  ("reference") `);
        await queryRunner.query(`CREATE TYPE "public"."deposit_requests_status_enum" AS ENUM('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED')`);
        await queryRunner.query(`CREATE TABLE "deposit_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "wallet_id" uuid NOT NULL, "reference" character varying(100) NOT NULL, "amount" bigint NOT NULL, "provider" character varying(20) NOT NULL DEFAULT 'paystack', "status" "public"."deposit_requests_status_enum" NOT NULL DEFAULT 'PENDING', "provider_reference" character varying, "authorization_url" character varying, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5474ff41b8c5aca99ac263e9b57" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e011c5dfcdc413491d1d642f26" ON "deposit_requests"  ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_601a85e801eb86ecf8f3f0cf0a" ON "deposit_requests"  ("wallet_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c11843d08a3666ebe81ee345aa" ON "deposit_requests"  ("reference") `);
        await queryRunner.query(`CREATE TABLE "webhook_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider" character varying(20) NOT NULL, "event_type" character varying(100) NOT NULL, "dedupe_key" character varying(200) NOT NULL, "payload" jsonb NOT NULL, "processed_at" TIMESTAMP WITH TIME ZONE, "processing_error" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4cba37e6a0acb5e1fc49c34ebfd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c64daa91cce26db387bc965e00" ON "webhook_events"  ("dedupe_key") `);
        await queryRunner.query(`CREATE TYPE "public"."withdrawal_requests_status_enum" AS ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "withdrawal_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "wallet_id" uuid NOT NULL, "amount" bigint NOT NULL, "bank_code" character varying(20) NOT NULL, "account_number" character varying(20) NOT NULL, "account_name" character varying, "reference" character varying(100) NOT NULL, "idempotency_key" character varying(100), "status" "public"."withdrawal_requests_status_enum" NOT NULL DEFAULT 'PENDING', "provider_reference" character varying, "failure_reason" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e1b3734a3f3cbd46bf0ad7eedb6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_59e24608606734b3ebcfd9fee8" ON "withdrawal_requests"  ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_09ba365288c710bc15432553fc" ON "withdrawal_requests"  ("wallet_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_85d30466c931e387e4c7174e4d" ON "withdrawal_requests"  ("reference") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_603cddc942efe258c62269c8c9" ON "withdrawal_requests"  ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`);
        await queryRunner.query(`CREATE TYPE "public"."transfer_requests_status_enum" AS ENUM('PROCESSING', 'SUCCESS', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "transfer_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sender_user_id" uuid NOT NULL, "recipient_user_id" uuid NOT NULL, "amount" bigint NOT NULL, "reference" character varying(100) NOT NULL, "idempotency_key" character varying(100), "status" "public"."transfer_requests_status_enum" NOT NULL, "failure_reason" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f97530bf47e4af43166089627ba" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3a775ea79089a113bc7b40da8d" ON "transfer_requests"  ("sender_user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_f1a1fe0effda4bc46ae485bf46" ON "transfer_requests"  ("recipient_user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4af12c63248726981eaa6f1b50" ON "transfer_requests"  ("reference") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8de410a4b0c94adb201777f4b5" ON "transfer_requests"  ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "wallets" ADD CONSTRAINT "FK_92558c08091598f7a4439586cda" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "wallets" DROP CONSTRAINT "FK_92558c08091598f7a4439586cda"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8de410a4b0c94adb201777f4b5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4af12c63248726981eaa6f1b50"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f1a1fe0effda4bc46ae485bf46"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3a775ea79089a113bc7b40da8d"`);
        await queryRunner.query(`DROP TABLE "transfer_requests"`);
        await queryRunner.query(`DROP TYPE "public"."transfer_requests_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_603cddc942efe258c62269c8c9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_85d30466c931e387e4c7174e4d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_09ba365288c710bc15432553fc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_59e24608606734b3ebcfd9fee8"`);
        await queryRunner.query(`DROP TABLE "withdrawal_requests"`);
        await queryRunner.query(`DROP TYPE "public"."withdrawal_requests_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c64daa91cce26db387bc965e00"`);
        await queryRunner.query(`DROP TABLE "webhook_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c11843d08a3666ebe81ee345aa"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_601a85e801eb86ecf8f3f0cf0a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e011c5dfcdc413491d1d642f26"`);
        await queryRunner.query(`DROP TABLE "deposit_requests"`);
        await queryRunner.query(`DROP TYPE "public"."deposit_requests_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e65825ccc890b273369f21ec2f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bb5cd6d7046b98d8faabe9c18f"`);
        await queryRunner.query(`DROP TABLE "ledger_entries"`);
        await queryRunner.query(`DROP TYPE "public"."ledger_entries_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fe0bb3f6520ee0469504521e71"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_92558c08091598f7a4439586cd"`);
        await queryRunner.query(`DROP TABLE "wallets"`);
    }

}
