import { Config } from "../../fileStores"
import { MiningPool } from '../pool';
import { IronfishIpcClient } from '../../rpc/clients'
import { FileUtils } from '../../utils/file'
import { FIND_PUBLICK_ADDRESS, StratumServer } from "../stratum/stratumServer"
import { Meter } from "../../metrics";
import { NodeFileProvider } from "../../fileSystems";
import sqlite3 from "sqlite3";
import {  oreToIron } from "../../utils";

const cors = require('cors')
const express = require('express')
const app = express()
app.use(cors())

const path = require('path');
const port = Number(process.env.PORT) || 5555;
const host = '192.168.1.147';

export default class webApi {
    currentRequetId: number

    readonly pool: MiningPool
    readonly config: Config
    readonly rpc: IronfishIpcClient
    readonly StratumServer: StratumServer
    readonly hashRate: Meter

    readonly host?: string
    readonly port?: number

    userInfo: any
    hash: any
    blockInfo: any = []
    avarageHashRateFifteenMinutes: Array<{hash: number, timestamp: {}}>
    avarageHashRateDay: Array<{hash: number, timestamp: string}>

    constructor(options: {
        pool: MiningPool,
        config: Config,
        rpc: IronfishIpcClient,
        StratumServer: StratumServer,
        hashRate: Meter,
        currentRequetId: number
        host?: string,
        port?: number
    }) {
        this.rpc = options.pool.rpc;
        this.config = options.config;
        this.pool = options.pool;
        this.StratumServer = options.StratumServer;
        this.hashRate = options.hashRate
        this.currentRequetId = options.currentRequetId
        this.avarageHashRateFifteenMinutes = []
        this.avarageHashRateDay = []
    }

    setViwes() {
        app.use(express.json())
        app.set('viwes engine', 'hbs');
        app.use(express.urlencoded({extended: true}))
        app.set('viwes', './views');
        app.use(express.static(path.join(__dirname, 'views/public')));
    }
    
    async setRoutes() {
        this.setViwes();

        const currnetMiners = () => {
            return this.StratumServer.myLog()
        }


        app.get("/api/home", async (req: any, res: any) => {
            // if( req.headers.token !== "forTimur" ) {
            //     return res.send({
            //         error: "Not permission"
            //     })
            // }

            let hash = await this.pool.estimateHashRate();
            let luck = await this.pool.lucky() == 15000 ? 0 : await this.pool.lucky();
            let getTheTotalPayoutOfThePool = await this.pool.getTheTotalPayoutOfThePool()            

            let succeeded = getTheTotalPayoutOfThePool

            let amountPayoutOfThePool:number = 0

            for ( let i = 0; i < succeeded.length; i++ ) {
                let next = i + 1
                    
                if( next === succeeded.length ) {
                    break
                }
                amountPayoutOfThePool = succeeded[i].amount + succeeded[next].amount
            }

            const fs = new NodeFileProvider()            
            await fs.init()

            const poolFolder = fs.join(this.config.dataDir, '/pool')

            const db = new sqlite3.Database(`${poolFolder}/database.sqlite`,
            sqlite3.OPEN_READWRITE, ( err ) => {
                if ( err ) throw err
            })

            db.all(`SELECT * FROM transactions`, async (err: Error, allRows: any) => {
                if ( err ) throw err.message
                this.blockInfo = []

                await allRows.forEach((user: any) => {
                    this.blockInfo.push(user)
                })
            })

            setTimeout(() => {
            let json = JSON.stringify({
                    counterHashRate: `${FileUtils.formatHashRate(hash)}/s`,
                    poolMiners: currnetMiners(),
                    luck: parseFloat(String(luck.toFixed(4))),
                    blocks: this.blockInfo,
                    amountOfUsersMoney: {
                        ironWithAComma: oreToIron(amountPayoutOfThePool),
                        unprocessedAmount: amountPayoutOfThePool
                    },
                })

            return res.send(json)
            }, 50)
        });
        this.listen();
    }

    statePool() {
        app.get('/api/statePool', async (req: any, res: any ) => {
            this.setViwes()
            let allRate = []

            let gethashRateFifteenMinutes = await this.pool.gethashRateFifteenMinutes()
            
            allRate.push(gethashRateFifteenMinutes)

            let json = JSON.stringify({
                hashRate: allRate
            })
            return res.send(json)
        })
    }

    findUser() {
  const urlencodedParser = express.urlencoded({extended: false});

        app.post("/api/finduser", urlencodedParser, async (req: any, res: any) => {
            if(!req.body) return res.sendStatus(400);

            let publicAddress = req.body.publickey

            let amountOfUsersMoney = await this.pool.getAmountUser(publicAddress)   
            let userRateEightHours = await this.pool.getUserHashRateGraphics(publicAddress) 
            
            const fs = new NodeFileProvider()        
            await fs.init()

            // if( req.headers.token !== "forTimur" ) {
            //     return res.send({
            //         error: "Not permission"
            //     })
            // }

            const errorNotFoundUser = {
                status: 200,
                errorMessage: '' 
            }

            const poolFolder = fs.join(this.config.dataDir, '/pool')

            const db = new sqlite3.Database(`${poolFolder}/database.sqlite`,
                sqlite3.OPEN_READWRITE, ( err ) => {
                    if ( err ) throw err
                })

            db.all('SELECT * FROM farmer', async (err:any, allRows: any) => {
                if ( err ) throw err.message

                this.hash = await this.StratumServer.valuesClients(FIND_PUBLICK_ADDRESS, publicAddress)
                
                allRows.find((user: any) => {
                    if ( user.publicAddress === publicAddress ) {
                        this.userInfo = user
                        errorNotFoundUser.status = 200
                        return user
                    } else if (user.publicAddress !== publicAddress) {
                        errorNotFoundUser.status = 404
                        errorNotFoundUser.errorMessage = 'Not Found User'
                    }
                })
            })

            setTimeout(() => {
                if ( errorNotFoundUser.status === 404 ) { 
                    let errorJson = JSON.stringify({
                        errorMessage: errorNotFoundUser.errorMessage
                    })
                    
                    return res.send(errorJson)
                } else if(errorNotFoundUser.status === 200){
                    let json = JSON.stringify({
                        publicAddress: this.userInfo?.publicAddress ? this.userInfo.publicAddress : 'default',
                        timestamp: this.userInfo?.timestamp,
                        amountOfUsersMoney: {
                            ironWithAComma: oreToIron(amountOfUsersMoney[0]?.amount),
                            unprocessedAmount: amountOfUsersMoney[0]?.amount
                        },
                        online: this.userInfo?.online < 1 ? this.userInfo?.lastMining: 'online',
                        hashRate: FileUtils.formatHashRate(this.hash ? this.hash : 0),
                        userRateEightHours: {
                            rawUserRateEightHours: userRateEightHours,
                        }
                    })
                    return res.send(json)
                }
            }, 100)          

        });
    }

    listen() {
        app.listen(port, host, () => {
            console.log(`Listening to requests on http://${host}:${port}`);
        });
    }

    start() {
        this.setRoutes();
        this.findUser();
        this.statePool()
    }
}