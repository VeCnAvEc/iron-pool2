/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

 import { Database } from 'sqlite'
 import { Migration } from '../migration'
 
 export default class Migration001 extends Migration {
   name = '001-inital'
 
   async forward(db: Database): Promise<void> {
     await db.run(`
       CREATE TABLE payout (
         id INTEGER PRIMARY KEY,
         createdAt INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
         succeeded BOOLEAN DEFAULT FALSE
       );
     `)
 
     await db.run(`
       CREATE TABLE share (
         id INTEGER PRIMARY KEY,
         publicAddress TEXT NOT NULL,
         createdAt INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
         payoutId INTEGER,
         CONSTRAINT share_fk_payout_id FOREIGN KEY (payoutId) REFERENCES payout (id)
       );
     `)
 
     await db.run(`
     CREATE TABLE farmer (
       id INTEGER PRIMARY KEY,
       publicAddress TEXT NOT NULL,
       timestamp INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
       amount INTEGER NOT NULL DEFAULT 0,
       lastMining INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
       online BOOLEAN DEFAULT FALSE
     );
   `)

    await db.run(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY,
      block TEXT NOT NULL,
      height TEXT NOT NULL,
      timestamp INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `),

   await db.run(`
    CREATE TABLE paid (
      id INTEGER PRIMARY KEY,
      block TEXT NOT NULL,
      timestamp INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await db.run(`
  CREATE TABLE eightHours (
    id INTEGER PRIMARY KEY,
    hashCount INTEGER NOT NULL DEFAULT 0,
    rawHashCount INTEGER NOT NULL DEFAULT 0,
    timestamp STRING NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
 `)

  await db.run(`
   CREATE TABLE day (
     id INTEGER PRIMARY KEY,
     shareCount INTEGER NOT NULL DEFAULT 0,
     timestamp INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
 `)

  await db.run(`
  CREATE TABLE userEightHours (
    id INTEGER PRIMARY KEY,
    publicAddress TEXT NOT NULL,
    hashCount INTEGER NOT NULL DEFAULT 0,
    rawHashCount INTEGER NOT NULL DEFAULT 0,
    timestamp STRING NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
 `)

   }
 
   async backward(db: Database): Promise<void> {
     await db.run('DROP TABLE payout;')
     await db.run('DROP TABLE share;')
     await db.run('DROP TABLE farmer;')
     await db.run('DROP TABLE transaction;')
     await db.run('DROP TABLE fifteen;')
     await db.run('DROP TABLE day;')
     await db.run('DROP TABLE userEightHours;')
   }
 }
 