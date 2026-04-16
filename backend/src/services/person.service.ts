import fs from 'fs/promises';
import path from 'path';
import { Person, PersonInput } from '../types';

class PersonService {
  private dataPath: string;
  private personsImagePath: string;
  private persons: Person[];
  private locked: boolean;

  constructor() {
    this.dataPath = path.join(__dirname, '..', '..', 'data', 'persons.json');
    this.personsImagePath = path.join(__dirname, '..', '..', 'data', 'person_images');
    this.persons = [];
    this.locked = false;
  }

  async initialize(): Promise<void> {
    // Ensure directories exist
    const dataDir = path.join(__dirname, '..', '..', 'data');
    try {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.mkdir(this.personsImagePath, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        console.error('Error creating directories:', error);
      }
    }

    await this.load();
  }

  // Execute operations with file lock to prevent race conditions
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    while (this.locked) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.locked = true;
    try {
      return await operation();
    } finally {
      this.locked = false;
    }
  }

  async load(): Promise<Person[]> {
    return this.withLock(async () => {
      try {
        const data = await fs.readFile(this.dataPath, 'utf-8');

        // Check if file is empty
        if (!data || data.trim().length === 0) {
          console.warn('persons.json is empty, initializing empty array');
          this.persons = [];
          return this.persons;
        }

        const parsed = JSON.parse(data);
        this.persons = parsed.persons || [];
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          this.persons = [];
        } else if (error instanceof SyntaxError) {
          // JSON parse error - file might be corrupted or being written
          console.error('persons.json is corrupted or being written, reinitializing:', error.message);
          this.persons = [];
          // Try to recover by saving empty array
          try {
            await fs.writeFile(this.dataPath, JSON.stringify({ persons: [] }, null, 2), 'utf-8');
            console.info('Recovered from corrupted file by writing empty array');
          } catch (saveError) {
            console.error('Failed to recover corrupted file:', saveError);
          }
        } else {
          console.error('Error loading persons:', error);
          this.persons = [];
        }
      }
      return this.persons;
    });
  }

  async save(): Promise<void> {
    return this.withLock(async () => {
      try {
        await fs.writeFile(this.dataPath, JSON.stringify({ persons: this.persons }, null, 2), 'utf-8');
      } catch (error) {
        console.error('Error saving persons:', error);
        throw error;
      }
    });
  }

  generatePersonId(): string {
    // Generate 6-digit unique number
    let id: string;
    let attempts = 0;
    do {
      id = Math.floor(100000 + Math.random() * 900000).toString();
      attempts++;
      if (attempts > 100) {
        throw new Error('Unable to generate unique person ID');
      }
    } while (this.persons.some(p => p.personId === id));
    return id;
  }

  async getAll(): Promise<Person[]> {
    return this.withLock(async () => {
      // Load fresh data from file
      try {
        const data = await fs.readFile(this.dataPath, 'utf-8');
        if (data && data.trim().length > 0) {
          const parsed = JSON.parse(data);
          this.persons = parsed.persons || [];
        } else {
          // File is empty
          this.persons = [];
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // File doesn't exist
          this.persons = [];
        } else if (error instanceof SyntaxError) {
          // JSON parse error - file might be corrupted
          console.error('persons.json is corrupted in getAll:', error.message);
          this.persons = [];
          // Try to recover by saving empty array
          try {
            await fs.writeFile(this.dataPath, JSON.stringify({ persons: [] }, null, 2), 'utf-8');
            console.info('Recovered from corrupted file by writing empty array');
          } catch (saveError) {
            console.error('Failed to recover corrupted file:', saveError);
          }
        } else {
          console.error('Error loading persons in getAll:', error);
          throw error;
        }
      }
      console.log(`📋 getAll() returning ${this.persons.length} persons:`, this.persons.map(p => ({ id: p.personId, name: p.name })));
      return this.persons;
    });
  }

  async getById(personId: string): Promise<Person | undefined> {
    const persons = await this.getAll();
    return persons.find(p => p.personId === personId);
  }

  async create(personData: PersonInput, faceImageBuffer: Buffer | null = null, faceImageFilename: string | null = null): Promise<Person> {
    return this.withLock(async () => {
      // Load fresh data from file
      try {
        const data = await fs.readFile(this.dataPath, 'utf-8');
        if (data && data.trim().length > 0) {
          const parsed = JSON.parse(data);
          this.persons = parsed.persons || [];
        } else {
          // File is empty
          this.persons = [];
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // File doesn't exist, start fresh
          this.persons = [];
        } else if (error instanceof SyntaxError) {
          // JSON parse error - file might be corrupted
          console.error('persons.json is corrupted in create:', error.message);
          this.persons = [];
        } else {
          console.error('Error loading persons in create:', error);
          // Re-throw to prevent creating with stale data
          throw error;
        }
      }

      // Check for duplicate personId - if exists, UPDATE instead of throwing error
      const existingIndex = personData.personId ? this.persons.findIndex(p => p.personId === personData.personId) : -1;

      if (existingIndex !== -1) {
        console.warn(`⚠️ Person ID ${personData.personId} already exists, performing update instead of create`);
        console.warn(`📋 Existing person:`, { id: this.persons[existingIndex].personId, name: this.persons[existingIndex].name });

        // Save face image if provided
        let faceImagePath = this.persons[existingIndex].faceImagePath;
        if (faceImageBuffer && faceImageFilename) {
          const timestamp = Date.now();
          const ext = path.extname(faceImageFilename);
          const imageFilename = `person_${timestamp}${ext}`;
          faceImagePath = path.join('person_images', imageFilename);
          const fullPath = path.join(this.personsImagePath, imageFilename);
          await fs.writeFile(fullPath, faceImageBuffer);
        }

        // Update existing person
        this.persons[existingIndex] = {
          ...this.persons[existingIndex],
          ...personData,
          faceImagePath: faceImagePath,
          updatedAt: new Date().toISOString()
        } as Person;

        // Save to file
        await fs.writeFile(this.dataPath, JSON.stringify({ persons: this.persons }, null, 2), 'utf-8');

        console.log(`✅ Person ${personData.personId} updated (instead of duplicate create)`);
        return this.persons[existingIndex];
      }

      let faceImagePath: string | null = null;

      // Save face image if provided
      if (faceImageBuffer && faceImageFilename) {
        const timestamp = Date.now();
        const ext = path.extname(faceImageFilename);
        const imageFilename = `person_${timestamp}${ext}`;
        faceImagePath = path.join('person_images', imageFilename);

        const fullPath = path.join(this.personsImagePath, imageFilename);
        await fs.writeFile(fullPath, faceImageBuffer);
      }

      const person: Person = {
        personId: personData.personId || this.generatePersonId(),
        name: personData.name || '',
        faceImagePath: faceImagePath,
        fingerprints: personData.fingerprints || [],
        cardNumbers: personData.cardNumbers || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.persons.push(person);

      // Save to file
      await fs.writeFile(this.dataPath, JSON.stringify({ persons: this.persons }, null, 2), 'utf-8');

      return person;
    });
  }

  async update(personId: string, personData: PersonInput, faceImageBuffer: Buffer | null = null, faceImageFilename: string | null = null): Promise<Person> {
    return this.withLock(async () => {
      // Load fresh data from file
      try {
        const data = await fs.readFile(this.dataPath, 'utf-8');
        if (data && data.trim().length > 0) {
          const parsed = JSON.parse(data);
          this.persons = parsed.persons || [];
        } else {
          this.persons = [];
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          this.persons = [];
        } else if (error instanceof SyntaxError) {
          console.error('persons.json is corrupted in update:', error.message);
          this.persons = [];
        } else {
          console.error('Error loading persons in update:', error);
          throw error;
        }
      }

      const index = this.persons.findIndex(p => p.personId === personId);
      if (index === -1) {
        throw new Error('Person not found');
      }

      // Check for duplicate personId (excluding current person)
      if (personData.personId && this.persons.some(p => p.personId === personData.personId && p.personId !== personId)) {
        throw new Error('Person ID already exists');
      }

      let faceImagePath = this.persons[index].faceImagePath;

      // Save new face image if provided
      if (faceImageBuffer && faceImageFilename) {
        const timestamp = Date.now();
        const ext = path.extname(faceImageFilename);
        const imageFilename = `person_${timestamp}${ext}`;
        faceImagePath = path.join('person_images', imageFilename);

        const fullPath = path.join(this.personsImagePath, imageFilename);
        await fs.writeFile(fullPath, faceImageBuffer);
      }

      this.persons[index] = {
        ...this.persons[index],
        ...personData,
        faceImagePath: faceImagePath,
        updatedAt: new Date().toISOString()
      } as Person;

      // Save to file
      await fs.writeFile(this.dataPath, JSON.stringify({ persons: this.persons }, null, 2), 'utf-8');

      return this.persons[index];
    });
  }

  async delete(personId: string): Promise<Person> {
    return this.withLock(async () => {
      // Load fresh data from file
      try {
        const data = await fs.readFile(this.dataPath, 'utf-8');
        if (data && data.trim().length > 0) {
          const parsed = JSON.parse(data);
          this.persons = parsed.persons || [];
        } else {
          this.persons = [];
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          this.persons = [];
        } else if (error instanceof SyntaxError) {
          console.error('persons.json is corrupted in delete:', error.message);
          this.persons = [];
        } else {
          console.error('Error loading persons in delete:', error);
          throw error;
        }
      }

      const index = this.persons.findIndex(p => p.personId === personId);
      if (index === -1) {
        throw new Error('Person not found');
      }

      // Delete face image if exists
      if (this.persons[index].faceImagePath) {
        const imagePath = path.join(__dirname, '..', '..', 'data', this.persons[index].faceImagePath);
        try {
          await fs.unlink(imagePath);
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            console.error('Error deleting face image:', error);
          }
        }
      }

      const [deleted] = this.persons.splice(index, 1);

      // Save to file
      await fs.writeFile(this.dataPath, JSON.stringify({ persons: this.persons }, null, 2), 'utf-8');

      return deleted;
    });
  }

  async getFaceImage(imagePath: string): Promise<Buffer> {
    const fullPath = path.join(__dirname, '..', '..', 'data', imagePath);
    try {
      const buffer = await fs.readFile(fullPath);
      return buffer;
    } catch (error) {
      console.error('Error reading face image:', error);
      throw error;
    }
  }
}

export default new PersonService();
