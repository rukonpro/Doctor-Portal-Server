
const express = require('express')
const app = express();
const cors = require('cors');
const admin = require("firebase-admin");
require('dotenv').config();
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
const stripe = require('stripe')(process.env.STRIPE_SECRET)
const port = process.env.PORT || 5000;

// doctor-portal-firebase-adminsdk.json
// ........................................

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// ------------------------------------------

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.af4at.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });


async function verifyToken(req, res, next) {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers?.authorization?.split(' ')[1];

        try {
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email;
        } catch {

        }
    }
    next();
}


async function run() {
    try {
        await client.connect();
        const database = client.db('Doctor_Portal');
        const appointmentsCollection = database.collection('appointments');
        const bookingsCollection = database.collection('bookings');
        const usersCollection = database.collection('users');
        const doctorsCollection = database.collection('doctors');


        app.get('/appointments', async (req, res) => {
            const email = req.query.email;
            const date = req.query.date;
            const query = { email: email, date: date }
            const cursor = await appointmentsCollection.find(query);
            const appointments = await cursor.toArray();
            res.json(appointments)
        })


        app.post('/appointments', verifyToken, async (req, res) => {
            const appointment = req.body;
            const result = await appointmentsCollection.insertOne(appointment)
            res.status(200).json(result);
        })
        app.post('/bookings', verifyToken, async (req, res) => {
            try {
                const bookings = req.body;
                const result = await bookingsCollection.insertMany(bookings)
                res.json(result)
            } catch (error) {
                res.status(400).json('Server Error');
            }
        })
        app.get('/bookings', verifyToken, async (req, res) => {
            try {
                const result = await bookingsCollection.find().toArray();
                res.status(200).json(result)
            } catch (error) {
                res.status(400).json('Server Error');
            }
        })
        app.patch('/bookings/:id', verifyToken, async (req, res) => {
            try {
                const id = req.params.id;
                const X = req.body.x;
                const Y = req.body.y;
                const options = { upsert: true };
                const filter = { _id: ObjectId(id) };
                const updateDoc = { $set: { dragElement: { x: X, y: Y } } }
                const result = await bookingsCollection.updateOne(filter, updateDoc, options);
                res.status(200).json(result);
            }
            catch (err) {
                res.status(400).json("Server Error")
            }

        })
        


        // get admin-----------------------
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let isAmin = false;
            if (user?.role === "admin") {
                isAmin = true;
            }
            res.json({ admin: isAmin })
        })
        app.get('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await appointmentsCollection.findOne(query);
            res.json(result)
        })
        // save to database user --------------
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user)
            res.json(result)
        })

        // update user=======================
        app.put('/users', async (req, res) => {
            const user = req.body;
            const filter = { email: user.email };
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result)

        })
        // admin add --------------------
        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req.decodedEmail;
            if (requester) {
                const requesterAccount = await usersCollection.findOne({ email: requester });
                if (requesterAccount.role === 'admin') {
                    const filter = { email: user.email };
                    const updateDoc = { $set: { role: 'admin' } }
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result)
                }
            }
            else {
                res.status(403).json({ message: 'you do not have access to make admin' })
            }


        })

        app.put('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    payment: payment
                }
            };
            const result = await appointmentsCollection.updateOne(filter, updateDoc);
            res.json(result);
        })


        app.get('/doctors', async (req, res) => {
            const cursor = doctorsCollection.find({});
            const doctors = await cursor.toArray();
            res.json(doctors)
        })

        app.post('/doctors', async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.json(result)
        })

        app.post('/create-payment-intent', async (req, res) => {
            const paymentInfo = req.body;
            const amount = paymentInfo.price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: ['card']
            });
            res.json({ clientSecret: paymentIntent.client_secret })
        })

    } finally {

        //   await client.close();
    }
}
run().catch(console.dir);






app.get('/', (req, res) => {
    res.send('Hello Doctors portal!')
})

app.listen(port, () => {
    console.log(` listening at${port}`)
})
