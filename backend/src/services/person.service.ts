import fs from 'fs/promises';
import path from 'path';
import { Person, PersonInput } from '../types';
import RepositoryFactory from '../repositories/RepositoryFactory';

const PERSONS_IMAGE_PATH = path.join(__dirname, '..', '..', 'data', 'person_images');

class PersonService {
  private get repo() { return RepositoryFactory.persons(); }

  async initialize(): Promise<void> {
    const dataDir = path.join(__dirname, '..', '..', 'data');
    try {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.mkdir(PERSONS_IMAGE_PATH, { recursive: true });
    } catch (e: any) { if (e.code !== 'EEXIST') console.error(e); }
  }

  private generatePersonId(existing: Person[]): string {
    let id: string;
    let attempts = 0;
    do {
      id = Math.floor(100000 + Math.random() * 900000).toString();
      if (++attempts > 100) throw new Error('Cannot generate unique person ID');
    } while (existing.some(p => p.personId === id));
    return id;
  }

  private async saveFaceImage(buffer: Buffer, filename: string): Promise<string> {
    const ext = path.extname(filename);
    const fn = `person_${Date.now()}${ext}`;
    const rel = path.join('person_images', fn);
    await fs.writeFile(path.join(PERSONS_IMAGE_PATH, fn), buffer);
    return rel;
  }

  async getAll(): Promise<Person[]> {
    return this.repo.findAll();
  }

  async getById(id: string): Promise<Person | undefined> {
    return (await this.repo.findById(id)) ?? undefined;
  }

  async create(
    personData: PersonInput,
    imgBuf: Buffer | null = null,
    imgName: string | null = null,
  ): Promise<Person> {
    const all = await this.repo.findAll();
    const dup = personData.personId ? all.find(p => p.personId === personData.personId) : undefined;
    if (dup) return this.update(dup.personId, personData, imgBuf, imgName);

    const faceImagePath = (imgBuf && imgName) ? await this.saveFaceImage(imgBuf, imgName) : null;
    const person: Person = {
      personId:     personData.personId || this.generatePersonId(all),
      name:         personData.name     || '',
      faceImagePath,
      fingerprints: personData.fingerprints || [],
      cardNumbers:  personData.cardNumbers  || [],
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    };
    return this.repo.create(person);
  }

  async update(
    personId: string,
    personData: PersonInput,
    imgBuf: Buffer | null = null,
    imgName: string | null = null,
  ): Promise<Person> {
    const existing = await this.repo.findById(personId);
    if (!existing) throw new Error('Person not found');
    const faceImagePath = (imgBuf && imgName)
      ? await this.saveFaceImage(imgBuf, imgName)
      : existing.faceImagePath;
    return this.repo.update({
      ...existing,
      ...personData,
      personId,
      faceImagePath,
      updatedAt: new Date().toISOString(),
    });
  }

  async delete(personId: string): Promise<Person> {
    const existing = await this.repo.findById(personId);
    if (!existing) throw new Error('Person not found');
    if (existing.faceImagePath) {
      try { await fs.unlink(path.join(__dirname, '..', '..', 'data', existing.faceImagePath)); }
      catch (e: any) { if (e.code !== 'ENOENT') console.error(e); }
    }
    return this.repo.delete(personId);
  }

  async getFaceImage(imagePath: string): Promise<Buffer> {
    return fs.readFile(path.join(__dirname, '..', '..', 'data', imagePath));
  }
}

export default new PersonService();
