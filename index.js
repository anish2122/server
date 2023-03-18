const express = require("express");
const cors = require("cors");
const res = require("express/lib/response");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

const verifyToken = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = header.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Access denied" });
    }
    req.decoded = decoded;
    next();
  });
};

//Mongodb

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@mydatabase.c39keae.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const run = async () => {
  try {
    await client.connect(err => {
      if (err) {
        console.error(err);
        return false;
      }
      // connection to mongo is successful, listen for requests
      app.listen(port, () => {
        console.log("listening for requests");
      });
    });

    console.log("db connected");
    const partsCollection = client.db("mobileParts").collection("parts");
    const myOrderCollection = client.db("mobileParts").collection("myOrders");
    const reviewCollection = client.db("mobileParts").collection("reviews");
    const usersCollection = client.db("mobileParts").collection("users");
    const paymentCollection = client.db("mobileParts").collection("payment");

    // getting all the parts
    app.get("/parts", async (req, res) => {
      const query = {};
      const cursor = partsCollection.find(query);
      const parts = await cursor.toArray();
      res.send(parts);
    });

    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/parts", async (req, res) => {
      const newParts = req.body;
      const result = await partsCollection.insertOne(newParts);
      res.send(result);
    });

    app.patch("/parts", async (req, res) => {
      const { _id, availableQuantity } = req.body;

      const filter = { _id: ObjectId(_id) };
      const product = await partsCollection.findOne(filter);

      const updateDB = {
        $set: {
          availableQuantity,
        },
      };
      const updateQuantity = await partsCollection.updateOne(filter, updateDB);
      res.send(updateQuantity);
    });

    app.patch("/updatepart", async (req, res) => {
      const {
        id,
        name,
        description,
        picture,
        price,
        minQuantity,
        availableQuantity,
      } = req.body;

      const filter = { _id: ObjectId(id) };

      const updateDB = {
        $set: {
          name,
          description,
          picture,
          price,
          minQuantity,
          availableQuantity,
        },
      };
      const updatePart = await partsCollection.updateMany(filter, updateDB);
      res.send(updatePart);
    });

    app.delete("/parts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await partsCollection.deleteOne(query);
      res.send(result);
    });

    // getting all reviews
    app.get("/reviews", async (req, res) => {
      const query = {};
      const cursor = reviewCollection.find(query).sort({ _id: -1 });
      const parts = await cursor.toArray();
      res.send(parts);
    });

    app.post("/reviews", async (req, res) => {
      const newOrder = req.body;
      const result = await reviewCollection.insertOne(newOrder);
      res.send(result);
    });

    // finding the parts by id
    app.get("/purchase/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await partsCollection.findOne(query);
      res.send(result);
    });

    app.post("/myOrders", async (req, res) => {
      const newOrder = req.body;
      const result = await myOrderCollection.insertOne(newOrder);
      res.send(result);
    });

    app.get("/myOrders", async (req, res) => {
      const query = {};
      const cursor = myOrderCollection.find(query);
      const orders = await cursor.toArray();
      res.send(orders);
    });

    app.get("/myOrders/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;
      if (email === decodedEmail) {
        const query = { email: email };
        const cursor = myOrderCollection.find(query);
        const myOrders = await cursor.toArray();
        return res.send(myOrders);
      } else {
        return res.status(403).send({ message: "Access denied" });
      }
    });

    app.get("/users", verifyToken, async (req, res) => {
      const query = {};
      const cursor = usersCollection.find(query);
      const allUsers = await cursor.toArray();
      res.send(allUsers);
    });

    app.get("/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;
      if (email === decodedEmail) {
        const query = { email: email };
        const cursor = usersCollection.find(query);
        const userInfo = await cursor.toArray();
        return res.send(userInfo);
      } else {
        return res.status(403).send({ message: "Access denied" });
      }
    });

    app.delete("/myOrders/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await myOrderCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/myOrders/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      const payment = req.body;

      const filter = { _id: ObjectId(id) };
      const updateDB = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const updatePayment = await myOrderCollection.updateOne(filter, updateDB);
      const result = await paymentCollection.insertOne(payment);
      res.send(updatePayment);
    });

    app.get("/myOrders/payment/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await myOrderCollection.findOne(query);
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.put("/user/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAcc = await usersCollection.findOne({ email: requester });
      if (requesterAcc.role === "admin") {
        const filter = { email: email };
        const options = { upsert: true };
        const updateDB = {
          $set: { role: "admin" },
        };
        const result = await usersCollection.updateOne(
          filter,
          updateDB,
          options
        );
        return res.send(result);
      } else {
        return res.status(403).send({ message: "forbidden" });
      }
    });

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDB = {
        $set: user,
      };
      const result = await usersCollection.updateOne(filter, updateDB, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET);
      res.send({ result, token });
    });
  } finally {
  }
};

//calling run function
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Manufacturer Server is running ");
});
