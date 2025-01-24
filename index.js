require('dotenv').config()
const express = require('express');
const cors = require('cors');
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5003;

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
        const cartCollection = client.db("PharmaPlace").collection("carts");

        // pharma place categories
        app.get("/categories", async (req, res) => {
            const cursor = categoriesCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        // pharma place medicine details
        // single equipment details
        app.get("/category/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await categoriesCollection.findOne(query);
            res.send(result);
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

