/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
 import { Database, open } from 'sqlite'
 import sqlite3 from 'sqlite3'
 import { Config } from '../../fileStores/config'
 import { NodeFileProvider } from '../../fileSystems/nodeFileSystem'
 import { Migrator } from './migrator'
 import { transactionReceives } from '../poolShares'
 
 export class PoolDatabase {
   private readonly db: Database
   private readonly config: Config
   private readonly migrations: Migrator
   private readonly attemptPayoutInterval: number
   private readonly successfulPayoutInterval: number
 
   constructor(options: { db: Database; config: Config }) {
     this.db = options.db
     this.config = options.config
     this.migrations = new Migrator({ db: options.db })
     this.attemptPayoutInterval = this.config.get('poolAttemptPayoutInterval')
     this.successfulPayoutInterval = this.config.get('poolSuccessfulPayoutInterval')
   }
 
   static async init(options: { config: Config }): Promise<PoolDatabase> {
     const fs = new NodeFileProvider()
     await fs.init()

     const poolFolder = fs.join(options.config.dataDir, '/pool')
     await fs.mkdir(poolFolder, { recursive: true })
 
     const db = await open({
       filename: fs.join(poolFolder, '/database.sqlite'),
       driver: sqlite3.Database,
     })
 
     return new PoolDatabase({
       db,
       config: options.config,
     })
   }
 
   async start(): Promise<void> {
     await this.migrations.migrate()
   }
 
   async stop(): Promise<void> {
    await this.db.close()
  }
 
   async newShare(publicAddress: string): Promise<void> {
    await this.db.run('INSERT INTO share (publicAddress) VALUES (?)', publicAddress)
   }
 
   async createUserFields(publicAddress: string | null, timestamp: any, online: boolean, lastMining: any): Promise<void> {
     const fs = new NodeFileProvider()
     await fs.init()
 
     let add = true
 
     const poolFolder = fs.join(this.config.dataDir, '/pool')
 
     const database = new sqlite3.Database(poolFolder + '/database.sqlite', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE)
 
     database.serialize(() => {
       database.all('SELECT publicAddress FROM farmer', (err: any, rows: any) => {
         if( err ) throw err
 
         for( let address in rows ) {
           if ( rows[address].publicAddress === publicAddress ) {
             add = false
             return
           }
         }
 
         if( add ) {
           this.db.run(`INSERT INTO farmer (publicAddress, timestamp, online, lastMining) VALUES(?,?,?,?)`,
           [publicAddress, timestamp, online, lastMining])
         }
       })
     })
   }
 
   async updateGivenHashRate(publicAddress: string, givenHashRate: number) {
     this.db.run(`UPDATE farmer set givenHashRate + ? WHERE pupublicAddress = ?`, [givenHashRate, publicAddress])
   }
 
   async setOfflineUser(publicAddress: string, time: number) {
     this.db.run(`UPDATE farmer SET online = 0,	lastMining = ? WHERE publicAddress = ?`,[time, publicAddress])
   }
 
   async setOnlineUser(publicAddress: string) {
     this.db.run(`UPDATE farmer SET online = 1 WHERE publicAddress = ?`, publicAddress)
   }
 
   async getSharesForPayout(timestamp: number): Promise<DatabaseShare[]> {
    return await this.db.all(
      "SELECT * FROM share WHERE payoutId IS NULL AND createdAt < datetime(?, 'unixepoch')",
      timestamp,
    )
  }
 
   async informationAboutTheBlock(condition: any, time: string | number) {
    console.log('file: database.ts',' main condition: ', condition, '\ncondition.hashed: ', condition.hashedHeader, '\ncondition.height: ', condition.height );
    this.db.run(`INSERT INTO transactions (block, height, timestamp) VALUES(?,?,?)`, [condition.hashedHeader, condition.height, time])
   }
   
    async newPayout(timestamp: number): Promise<number | null> {
    	// Create a payout row if the most recent succesful payout was greater than the payout interval
    	// and the most recent payout was greater than the attempt interval, in case of failed or long
    	// running payouts.
    	const successfulPayoutCutoff = timestamp - this.successfulPayoutInterval
    	const attemptPayoutCutoff = timestamp - this.attemptPayoutInterval

    	const query = `
             INSERT INTO payout (succeeded)
         	    SELECT FALSE WHERE
           	   NOT EXISTS (SELECT * FROM payout WHERE createdAt > datetime(?, 'unixepoch') AND succeeded = TRUE)
           	    AND NOT EXISTS (SELECT * FROM payout WHERE createdAt > datetime(?, 'unixepoch'))
     `

       const result = await this.db.run(query, successfulPayoutCutoff, attemptPayoutCutoff)
    	   if (result.changes !== 0 && result.lastID != null) {   	   
         return result.lastID
       }

      	return null
      }
 
    async markPayoutSuccess(id: number, timestamp: number): Promise<void> {
      await this.db.run('UPDATE payout SET succeeded = TRUE WHERE id = ?', id)
      await this.db.run(
        "UPDATE share SET payoutId = ? WHERE payoutId IS NULL AND createdAt < datetime(?, 'unixepoch')",
        id,
        timestamp,
      )
    }
 
    async shareCountSince(timestamp: number): Promise<number> {
      const result = await this.db.get<{ count: number }>(
        "SELECT COUNT(id) AS count FROM share WHERE createdAt > datetime(?, 'unixepoch')",
        timestamp,
    )
      if (result == null) {
        return 0
    }
      return result.count
    }
 
   async shareCount(timestamp: number, publicAddress: string | null | undefined): Promise<number> {
     const result = await this.db.get<{ count: number }>(
       "SELECT COUNT(id) AS count FROM share WHERE publicAddress = ? AND createdAt > datetime(?, 'unixepoch')",
       publicAddress,
       timestamp,
     )

     if (result == null) {
       return 0
     }
     return result.count
   }

   async userHashRateForFifteenMinutes(timestamp: number, publicAddress: string | null | undefined): Promise<number> {
    const result = await this.db.get<{ count: number }>(
      "SELECT COUNT(id) AS count FROM share WHERE publicAddress = ? AND createdAt > datetime(?, 'unixepoch')",
      publicAddress,
      timestamp,
    )

    if (result == null) {
      return 0
    }
    return result.count
  }

   async howMuchWasPaid( transaction: transactionReceives ) {
    console.log(transaction)
    await this.db.run(`UPDATE farmer SET amount = amount + ? WHERE publicAddress = ?`, [transaction.amount, transaction.publicAddress])
   }

   async getAmountUser(publicAddress: string) {
     return this.db.all('SELECT amount FROM farmer WHERE publicAddress = ?', [publicAddress])
   }

   async getTheTotalPayoutOfThePool(){
    return this.db.all(`SELECT amount FROM farmer`)
   }  

   async gethashRateFifteenMinutes() {
     return await this.db.all(`SELECT * FROM eightHours`)
   }

   async hashRateFifteen(hashRateFifteenMinutes: any) {
    await this.db.run(`INSERT INTO eightHours (hashCount,rawHashCount, timestamp) VALUES(?,?,?)`, hashRateFifteenMinutes.hashRate.processedHashrate, hashRateFifteenMinutes.hashRate.rawHashrate, hashRateFifteenMinutes.data)
   }

   async userHashForGraphics(date: Array<any>) {
     for(let i = 0; i < date.length; i++) {       
      await this.db.run(`INSERT INTO userEightHours (publicAddress, hashCount,rawHashCount, timestamp) VALUES(?,?,?,?)`, [date[i].publicAddress, date[i].hashRateEightHours,date[i].rawHashRateEightHours, date[i].data])
     }
   } 

   async getUserHashRateGraphics(publicAddress: string) {
     return await this.db.all(`SELECT * FROM userEightHours WHERE publicAddress = ?`, [publicAddress])
   }

   async getAllDbRows(sql: string) {
     try {
       await this.db.open()
       
       this.db.all(sql, [], (err: Error, rows: Array<any>) => {
         if ( err ) {
           throw err.message
         }
 
         rows.forEach((row: string | number) => {
           return row
         })  
       })
     }finally{
       this.db.close();
     }
   }
 
 }
 
 export type DatabaseShare = {
   id: number
   publicAddress: string
   createdAt: Date
   payoutId: number | null
 }
 