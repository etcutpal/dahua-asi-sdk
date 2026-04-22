/**
 * IPersonRepository.ts — Repository interface for Persons and Employees
 *
 * SQL schema hints:
 *
 *   CREATE TABLE persons (
 *     person_id       VARCHAR(64)   PRIMARY KEY,
 *     name            VARCHAR(255)  NOT NULL,
 *     card_number     VARCHAR(64),
 *     face_image_path VARCHAR(512),
 *     password        VARCHAR(128),
 *     group_id        VARCHAR(64),
 *     department      VARCHAR(64),
 *     created_at      DATETIME      NOT NULL,
 *     updated_at      DATETIME      NOT NULL
 *   );
 *
 *   -- employees extends persons with HR-specific fields
 *   CREATE TABLE employees (
 *     id              VARCHAR(64)   PRIMARY KEY,
 *     person_id       VARCHAR(64)   NOT NULL UNIQUE,
 *     name            VARCHAR(255)  NOT NULL,
 *     department      VARCHAR(64),
 *     group_id        VARCHAR(64),
 *     card_number     VARCHAR(64),
 *     face_image_path VARCHAR(512),
 *     profile_image_path VARCHAR(512),
 *     created_at      DATETIME      NOT NULL,
 *     updated_at      DATETIME      NOT NULL
 *   );
 *
 *   CREATE TABLE employee_groups (
 *     id        VARCHAR(64)   PRIMARY KEY,
 *     name      VARCHAR(255)  NOT NULL,
 *     parent_id VARCHAR(64)   REFERENCES employee_groups(id)
 *   );
 */

import { Person, PersonInput } from '../types';

// ─── Person Repository ────────────────────────────────────────────────────────

export interface IPersonRepository {
  findAll(): Promise<Person[]>;
  findById(personId: string): Promise<Person | null>;
  create(person: Person): Promise<Person>;
  update(person: Person): Promise<Person>;
  delete(personId: string): Promise<Person>;
}

// ─── Employee Repository ──────────────────────────────────────────────────────

export interface IEmployeeRepository {
  findAll(): Promise<any[]>;
  findById(id: string): Promise<any | null>;
  findByPersonId(personId: string): Promise<any | null>;
  save(employees: any[]): Promise<void>;
}

// ─── Employee Group Repository ────────────────────────────────────────────────

export interface IEmployeeGroupRepository {
  findAll(): Promise<any[]>;
  findById(id: string): Promise<any | null>;
  save(groups: any[]): Promise<void>;
}
