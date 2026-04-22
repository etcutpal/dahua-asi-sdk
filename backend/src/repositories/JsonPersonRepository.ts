/**
 * JsonPersonRepository.ts — JSON file implementations of IPersonRepository,
 *                           IEmployeeRepository, IEmployeeGroupRepository.
 *
 * Swap for SQL implementations when moving to a database.
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { IPersonRepository, IEmployeeRepository, IEmployeeGroupRepository } from './IPersonRepository';
import { Person } from '../types';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// ─── Persons ──────────────────────────────────────────────────────────────────

export class JsonPersonRepository implements IPersonRepository {
  private filePath: string;

  constructor(filePath = path.join(DATA_DIR, 'persons.json')) {
    this.filePath = filePath;
  }

  private async read(): Promise<Person[]> {
    try {
      const raw = await fsp.readFile(this.filePath, 'utf-8');
      if (!raw || !raw.trim()) return [];
      return JSON.parse(raw).persons || [];
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  private async write(persons: Person[]): Promise<void> {
    await fsp.writeFile(this.filePath, JSON.stringify({ persons }, null, 2), 'utf-8');
  }

  async findAll(): Promise<Person[]> {
    return this.read();
  }

  async findById(personId: string): Promise<Person | null> {
    const persons = await this.read();
    return persons.find(p => p.personId === personId) || null;
  }

  async create(person: Person): Promise<Person> {
    const persons = await this.read();
    persons.push(person);
    await this.write(persons);
    return person;
  }

  async update(person: Person): Promise<Person> {
    const persons = await this.read();
    const idx = persons.findIndex(p => p.personId === person.personId);
    if (idx === -1) throw new Error('Person not found');
    persons[idx] = person;
    await this.write(persons);
    return person;
  }

  async delete(personId: string): Promise<Person> {
    const persons = await this.read();
    const idx = persons.findIndex(p => p.personId === personId);
    if (idx === -1) throw new Error('Person not found');
    const [deleted] = persons.splice(idx, 1);
    await this.write(persons);
    return deleted;
  }
}

// ─── Employees ────────────────────────────────────────────────────────────────

export class JsonEmployeeRepository implements IEmployeeRepository {
  private filePath: string;

  constructor(filePath = path.join(DATA_DIR, 'employees.json')) {
    this.filePath = filePath;
  }

  private read(): any[] {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')).employees || [];
    } catch {
      return [];
    }
  }

  private write(employees: any[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify({ employees }, null, 2), 'utf-8');
  }

  async findAll(): Promise<any[]> {
    return this.read();
  }

  async findById(id: string): Promise<any | null> {
    return this.read().find((e: any) => e.id === id) || null;
  }

  async findByPersonId(personId: string): Promise<any | null> {
    return this.read().find((e: any) => e.personId === personId || e.id === personId) || null;
  }

  async save(employees: any[]): Promise<void> {
    this.write(employees);
  }
}

// ─── Employee Groups ──────────────────────────────────────────────────────────

export class JsonEmployeeGroupRepository implements IEmployeeGroupRepository {
  private filePath: string;

  constructor(filePath = path.join(DATA_DIR, 'employee-groups.json')) {
    this.filePath = filePath;
  }

  private read(): any[] {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')).groups || [];
    } catch {
      return [];
    }
  }

  private write(groups: any[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify({ groups }, null, 2), 'utf-8');
  }

  async findAll(): Promise<any[]> {
    return this.read();
  }

  async findById(id: string): Promise<any | null> {
    return this.read().find((g: any) => g.id === id) || null;
  }

  async save(groups: any[]): Promise<void> {
    this.write(groups);
  }
}
