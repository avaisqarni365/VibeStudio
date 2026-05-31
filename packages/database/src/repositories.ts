import { Knex } from "knex";
import { db } from "./index";

export abstract class BaseRepository<T> {
  protected tableName: string;
  protected db: Knex;

  constructor(tableName: string) {
    this.tableName = tableName;
    this.db = db;
  }

  async findById(id: string): Promise<T | null> {
    const result = await this.db(this.tableName).where({ id }).first();
    return result || null;
  }

  async findAll(filters: Partial<T> = {}): Promise<T[]> {
    return this.db(this.tableName).where(filters);
  }

  async create(data: Partial<T>): Promise<T> {
    const [result] = await this.db(this.tableName).insert(data).returning("*");
    return result;
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const [result] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning("*");
    return result;
  }

  async delete(id: string): Promise<void> {
    await this.db(this.tableName).where({ id }).delete();
  }
}
