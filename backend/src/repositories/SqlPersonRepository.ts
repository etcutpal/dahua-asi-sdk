/**
 * SqlPersonRepository.ts
 *
 * SQL implementations of IPersonRepository, IEmployeeRepository,
 * and IEmployeeGroupRepository.
 *
 * Uses the IDbConnection wrapper so it works transparently with
 * SQL Server, MySQL, and PostgreSQL — the wrapper handles placeholder
 * syntax differences (? → @p0 for mssql, $1 for pg).
 */

import { IDbConnection } from './DatabaseConnection';
import { IPersonRepository, IEmployeeRepository, IEmployeeGroupRepository } from './IPersonRepository';
import { Person } from '../types';

// ─── helper: convert ISO string / Date / null to a JS Date (or null) ─────────
// SQL Server (mssql) rejects ISO strings with trailing 'Z' for DATETIME2 columns.
// Passing a native JS Date object works correctly with all drivers.
function toDate(v: any): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ─── helper: row → camelCase ──────────────────────────────────────────────────

function rowToPerson(row: any): Person {
  return {
    personId:       row.person_id,
    name:           row.name,
    faceImagePath:  row.face_image_path ?? null,
    fingerprints:   row.fingerprints   ? JSON.parse(row.fingerprints)   : [],
    cardNumbers:    row.card_numbers   ? JSON.parse(row.card_numbers)   : [],
    createdAt:      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt:      row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function rowToEmployee(row: any): any {
  const groupId = row.group_id ?? null;
  return {
    id:                 row.id,
    personId:           row.person_id,
    name:               row.name,
    department:         row.department        ?? null,
    groupId,
    groups:             groupId ? [groupId] : [],
    // Support both legacy single card_number and new card_numbers JSON array
    cardNumbers:        row.card_numbers      ? JSON.parse(row.card_numbers)
                        : row.card_number     ? [row.card_number]
                        : [],
    fingerprints:       row.fingerprints      ? JSON.parse(row.fingerprints) : [],
    faceImagePath:      row.face_image_path   ?? null,
    facePicture:        row.face_picture      ?? row.face_image_path ?? null,
    profileImagePath:   row.profile_image_path ?? null,
    profilePicture:     row.profile_picture   ?? row.profile_image_path ?? null,
    password:           row.password          ?? '',
    gender:             row.gender            ?? '',
    title:              row.title             ?? '',
    nickname:           row.nickname          ?? '',
    dateOfBirth:        row.date_of_birth     ?? '',
    phone:              row.phone             ?? '',
    occupation:         row.occupation        ?? '',
    email:              row.email             ?? '',
    address:            row.address           ?? '',
    remarks:            row.remarks           ?? '',
    effectiveStart:     row.effective_start instanceof Date ? row.effective_start.toISOString() : (row.effective_start ?? null),
    effectiveEnd:       row.effective_end     instanceof Date ? row.effective_end.toISOString()   : (row.effective_end   ?? null),
    createdAt:          row.created_at        instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt:          row.updated_at        instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function rowToGroup(row: any): any {
  return {
    id:          row.id,
    name:        row.name,
    description: row.description ?? null,
    parentId:    row.parent_id   ?? null,
    createdAt:   row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

// ─── Person Repository ────────────────────────────────────────────────────────

export class SqlPersonRepository implements IPersonRepository {
  constructor(private db: IDbConnection) {}

  async findAll(): Promise<Person[]> {
    const rows = await this.db.query('SELECT * FROM persons ORDER BY name');
    return rows.map(rowToPerson);
  }

  async findById(personId: string): Promise<Person | null> {
    const rows = await this.db.query('SELECT * FROM persons WHERE person_id = ?', [personId]);
    return rows.length ? rowToPerson(rows[0]) : null;
  }

  async create(person: Person): Promise<Person> {
    await this.db.query(
      `INSERT INTO persons (id, person_id, name, face_image_path, fingerprints, card_numbers, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        person.personId,
        person.personId,
        person.name,
        person.faceImagePath ?? null,
        JSON.stringify(person.fingerprints ?? []),
        JSON.stringify(person.cardNumbers  ?? []),
        toDate(person.createdAt),
        toDate(person.updatedAt),
      ],
    );
    return person;
  }

  async update(person: Person): Promise<Person> {
    await this.db.query(
      `UPDATE persons SET name=?, face_image_path=?, fingerprints=?, card_numbers=?, updated_at=?
       WHERE person_id=?`,
      [
        person.name,
        person.faceImagePath ?? null,
        JSON.stringify(person.fingerprints ?? []),
        JSON.stringify(person.cardNumbers  ?? []),
        toDate(person.updatedAt),
        person.personId,
      ],
    );
    return person;
  }

  async delete(personId: string): Promise<Person> {
    const existing = await this.findById(personId);
    if (!existing) throw new Error(`Person ${personId} not found`);
    await this.db.query('DELETE FROM persons WHERE person_id = ?', [personId]);
    return existing;
  }
}

// ─── Employee Repository ──────────────────────────────────────────────────────

export class SqlEmployeeRepository implements IEmployeeRepository {
  constructor(private db: IDbConnection) {}

  async findAll(): Promise<any[]> {
    const rows = await this.db.query('SELECT * FROM employees ORDER BY name');
    return rows.map(rowToEmployee);
  }

  async findById(id: string): Promise<any | null> {
    const rows = await this.db.query('SELECT * FROM employees WHERE id = ?', [id]);
    return rows.length ? rowToEmployee(rows[0]) : null;
  }

  async findByPersonId(personId: string): Promise<any | null> {
    const rows = await this.db.query(
      'SELECT * FROM employees WHERE person_id = ? OR id = ?',
      [personId, personId],
    );
    return rows.length ? rowToEmployee(rows[0]) : null;
  }

  async save(employees: any[]): Promise<void> {
    // Upsert all — clear + re-insert is simplest and consistent with JSON behaviour
    await this.db.query('DELETE FROM employees WHERE 1=1', []);
    for (const e of employees) {
      await this.db.query(
        `INSERT INTO employees
           (id, person_id, name, department, group_id,
            card_numbers, face_picture, profile_picture,
            password, fingerprints, gender, title, nickname, date_of_birth,
            phone, occupation, email, address, remarks,
            effective_start, effective_end, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          e.id,
          e.personId,
          e.name,
          e.department   ?? null,
          e.groupId      ?? e.department ?? null,
          JSON.stringify(e.cardNumbers ?? (e.cardNumber ? [e.cardNumber] : [])),
          e.facePicture        ?? e.faceImagePath ?? null,
          e.profilePicture     ?? e.profileImagePath ?? null,
          e.password           ?? null,
          JSON.stringify(e.fingerprints ?? []),
          e.gender             ?? null,
          e.title              ?? null,
          e.nickname           ?? null,
          e.dateOfBirth        ?? null,
          e.phone              ?? null,
          e.occupation         ?? null,
          e.email              ?? null,
          e.address            ?? null,
          e.remarks            ?? null,
          toDate(e.effectiveStart ?? e.effective_start),
          toDate(e.effectiveEnd   ?? e.effective_end),
          toDate(e.createdAt  ?? e.created_at)  ?? new Date(),
          toDate(e.updatedAt  ?? e.updated_at)  ?? new Date(),
        ],
      );
    }
  }
}

// ─── Employee Group Repository ────────────────────────────────────────────────

export class SqlEmployeeGroupRepository implements IEmployeeGroupRepository {
  constructor(private db: IDbConnection) {}

  async findAll(): Promise<any[]> {
    const rows = await this.db.query('SELECT * FROM employee_groups ORDER BY name');
    return rows.map(rowToGroup);
  }

  async findById(id: string): Promise<any | null> {
    const rows = await this.db.query('SELECT * FROM employee_groups WHERE id = ?', [id]);
    return rows.length ? rowToGroup(rows[0]) : null;
  }

  async save(groups: any[]): Promise<void> {
    await this.db.query('DELETE FROM employee_groups WHERE 1=1', []);
    for (const g of groups) {
      await this.db.query(
        `INSERT INTO employee_groups (id, name, description, parent_id, created_at)
         VALUES (?,?,?,?,?)`,
        [g.id, g.name, g.description ?? null, g.parentId ?? null,
         toDate(g.createdAt) ?? toDate(new Date().toISOString())],
      );
    }
  }
}
