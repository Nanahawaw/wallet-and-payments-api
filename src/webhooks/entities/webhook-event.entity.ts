import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Dedupe log for inbound provider webhooks. `dedupeKey` gets a unique index so a
 * second delivery of the same event hits a constraint violation and is dropped
 * before it can ever be processed twice - this is the primary defense against
 * "webhook fired twice", independent of whatever the job processor does.
 */
@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  provider: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Index({ unique: true })
  @Column({ name: 'dedupe_key', type: 'varchar', length: 200 })
  dedupeKey: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'processing_error', type: 'text', nullable: true })
  processingError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
