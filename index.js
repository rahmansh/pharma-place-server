require('dotenv').config()
const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5003;

// stripe
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// middleware
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_USER}@cluster0.tnqvu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const categoriesCollection = client.db("PharmaPlace").collection("categories");
        const userCollection = client.db("PharmaPlace").collection("users");
        const medicineCollection = client.db("PharmaPlace").collection("medicines");
        const cartCollection = client.db("PharmaPlace").collection("carts");
        const paymentCollection = client.db("PharmaPlace").collection("payments");


        // jwt related api
        app.post("/jwt", async (req, res) => {
            const user = req.body;

            const token = jwt.sign(
                user,
                process.env.ACCESS_TOKEN_SECRET,
                { expiresIn: '1h' }
            )

            res.send({ token })
        })

        // middlewares
        const verifyToken = (req, res, next) => {
            console.log("Inside verify token: ", req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'forbidden access' })
            }
            const token = req.headers.authorization.split(' ')[1];

            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'forbidden access' })
                }

                req.decoded = decoded;
                next();
            })
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let isAdmin = user?.role === 'Admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        // check if an user is admin or not
        app.get("/users/admin/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'unauthorized access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let role;
            if (user) {
                role = user.role;
            }

            res.send({ role })
        })

        // get all the users
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const cursor = userCollection.find();
            const result = await cursor.toArray();
            res.send(result)
        })

        // delete user
        app.delete("/user/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = userCollection.deleteOne(query);
            res.send(result)
        })

        // user role
        app.patch("/users/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'Admin'
                }
            }

            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.patch("/users/seller/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'Seller'
                }
            }

            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.patch("/user/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'User'
                }
            }

            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })






        // insert user data for the first time
        app.post("/users", async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: `User already exists: InsertedId: ${null}` })
            }

            const result = await userCollection.insertOne(user);
            res.send(result)
        })

        // pharma place categories
        app.get("/categories", async (req, res) => {
            const cursor = categoriesCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })


        // pharma place medicine details
        app.get("/medicines", async (req, res) => {
            const cursor = medicineCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        // post medicines
        app.post("/medicines", async (req, res) => {
            const medicine = req.body;
            const result = await medicineCollection.insertOne(medicine);
            res.send(result);
        })



        // carts collection
        app.get('/cartItems', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        })

        app.delete("/carts/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query)
            res.send(result)
        })


        app.get("/carts", async (req, res) => {
            const { email, medicineName } = req.query;


            if (!email || !medicineName) {
                return res.status(400).send({ error: "Email and medicineName are required." })
            }

            const query = {
                email: email,
                name: medicineName,
            }

            try {
                const result = await cartCollection.find(query).toArray();
                res.send(result);
            } catch (error) {
                console.error("Error fetching cart items: ", error);
                res.status(500).send({ error: "An error occured while fetching the cart items." });
            }

        })


        app.patch("/carts/:id", async (req, res) => {
            const id = req.params.id;
            const { orderQuantity } = req.body;

            if (!orderQuantity || orderQuantity < 1) {
                return res.status(400).send({ error: "Invalid order quantity." });
            }

            const query = { _id: new ObjectId(id) };
            const update = {
                $set: {
                    orderQuantity: orderQuantity,
                }
            }

            try {
                const result = await cartCollection.updateOne(query, update);
                if (result.modifiedCount === 1) {
                    res.send({ success: true, message: "Order quantity updated successfully." })
                } else {
                    res.status(404).send({ error: "Cart item not found or already updated." })
                }
            } catch (error) {
                console.error("Error updating cart: ", error);
                res.status(500).send({ error: "An error occured while updating the cart." })
            }
        })

        app.post("/carts", async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
        })

        app.delete("/carts", async (req, res) => {
            const email = req.query.email;

            if (!email) {
                return res.status(400).send({ error: "Email is required." });
            }

            try {
                const query = { email: email };
                const result = await cartCollection.deleteMany(query);
                res.send({ success: true, deleteCount: result.deletedCount });
            } catch (error) {
                console.error("Error clearing cart: ", error);
                res.status(500).send({ error: "An error occured while clearing the cart." })
            }
        })

        // get all the medicines added by user
        app.get("/medicines/:email", async (req, res) => {
            const email = req.params.email;
            const query = { addedBy: req.params.email }

            const result = await medicineCollection.find(query).toArray();
            res.send(result)
        })

        // stats or analytics
        app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const medicines = await medicineCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();


            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray();

            const revenue = result.length > 0 ? result[0].totalRevenue : 0;

            res.send({
                users,
                medicines,
                orders,
                revenue

            })


        })


        // payment
        app.get("/payments/:email", verifyToken, async (req, res) => {
            const query = { email: req.params.email }
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({
                    message: 'forbidden access'
                })
            }

            const result = await paymentCollection.find(query).toArray();
            res.send(result)
        })






        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: [
                    "card"
                ]
            })

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })

        app.post("/payments", async (req, res) => {
            const payement = req.body;
            const paymentResult = await paymentCollection.insertOne(payement);

            console.log("Payment info", payement);


            const query = {
                _id: {
                    $in: payement.cartIds.map(id => new ObjectId(id))
                }
            }

            const deleteResult = await cartCollection.deleteMany(query);

            res.send({ paymentResult, deleteResult })

        })


        // manage category
        app.get("/categories", async (req, res) => {
            const cursor = categoriesCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        // add category
        app.post("/categories", async (req, res) => {
            const category = req.body;
            const result = await categoriesCollection.insertOne(category);
            res.send(result);
        })













        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})

