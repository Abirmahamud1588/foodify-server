const express = require("express");
const app = express();
const cors = require("cors");

const jwt = require("jsonwebtoken");

require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());

const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access2" });
    }
    req.decoded = decoded; // Set the decoded property on the req object
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.120eciu.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const menucollection = client.db("restaurant").collection("menu");
    const reviewscollection = client.db("restaurant").collection("reviews");
    const cartscollection = client.db("restaurant").collection("carts");
    const userscollection = client.db("restaurant").collection("users");

    const paymentCollection = client.db("restaurant").collection("payments");

    //jwt token
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    // Warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userscollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };
    //users fetching
    app.get("/users", verifyJwt, verifyAdmin, async (req, res) => {
      const result = await userscollection.find().toArray();
      res.send(result);
    });
    //users uploading
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await userscollection.insertOne(user);
      res.send(result);
    });

    //admin email -security :verifyJwt
    app.get("/users/admin/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.send({ admin: false });
      }
      const query = { email: email };
      const user = await userscollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    //userd el
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userscollection.deleteOne(query);
      res.send(result);
    });
    //admin making
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedocs = {
        $set: {
          role: "admin",
        },
      };
      const result = await userscollection.updateOne(filter, updatedocs);
      res.send(result);
    });
    //menu fetching
    app.get("/menu", async (req, res) => {
      const result = await menucollection.find().toArray();
      res.send(result);
    });
    //menu posting
    app.post("/menu", verifyJwt, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await menucollection.insertOne(newItem);
      res.send(result);
    });

    //delete a item from the menu
    app.delete("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menucollection.deleteOne(query);
      res.send(result);
    });
    //reveiws fetching
    app.get("/reviews", async (req, res) => {
      const result = await reviewscollection.find().toArray();
      res.send(result);
    });
    //cart by user email
    app.get("/carts", verifyJwt, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { email: email };
      const result = await cartscollection.find(query).toArray();
      res.send(result);
    });

    //carts uploading
    app.post("/carts", async (req, res) => {
      const item = req.body;
      console.log(item);
      const result = await cartscollection.insertOne(item);
      res.send(result);
    });
    //delete a product from the carts
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartscollection.deleteOne(query);
      res.send(result);
    });

    //update a product from the carts for quantity
    app.put("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const { quantity } = req.body;
      const query = { _id: new ObjectId(id) };
      const option = { upsert: true };
      const updatedoc = {
        $set: {
          quantity: parseInt(quantity, 10),
        },
      };
      const result = await cartscollection.updateOne(query, updatedoc, option);
    });

    //order his
    // Fetch order history for a user
    app.get("/orders", verifyJwt, async (req, res) => {
      try {
        const email = req.decoded.email; // Get the logged-in user's email from the JWT token
        const userOrders = await paymentCollection.find({ email }).toArray(); // Find orders associated with the user's email
        res.send(userOrders); // Send the user's order history
      } catch (error) {
        console.error("Error fetching order history:", error);
        res
          .status(500)
          .send({ error: true, message: "Error fetching order history" });
      }
    });

    //payment
    // create payment intent
    app.post("/create-payment-intent", verifyJwt, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // payment related api
    app.post("/payments", verifyJwt, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = {
        _id: { $in: payment.cartItems.map((id) => new ObjectId(id)) },
      };
      const deleteResult = await cartscollection.deleteMany(query);

      res.send({ insertResult, deleteResult });
    });

    app.get("/payments", verifyJwt, async (req, res) => {
      const email = req.decoded.email; // Get the logged-in user's email from the JWT token
      const userPayments = await paymentCollection.find({ email }).toArray(); // Find payments associated with the user's email
      res.send(userPayments); // Send the filtered payment history
    });

    app.get("/admin-stats", verifyJwt, verifyAdmin, async (req, res) => {
      const users = await userscollection.estimatedDocumentCount();
      const products = await menucollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // best way to get sum of the price field is to use group and sum operator
      /*
        await paymentCollection.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: '$price' }
            }
          }
        ]).toArray()
      */

      const payments = await paymentCollection.find().toArray();
      const revenue = payments.reduce((sum, payment) => sum + payment.price, 0);

      res.send({
        revenue,
        users,
        products,
        orders,
      });
    });
    /// bangla
    app.get("/order-stats", verifyJwt, verifyAdmin, async (req, res) => {
      const pipeline = [
        {
          $lookup: {
            from: "menu",
            localField: "menuItems",
            foreignField: "_id",
            as: "menuItemsData",
          },
        },
        {
          $unwind: "$menuItemsData",
        },
        {
          $group: {
            _id: "$menuItemsData.category",
            count: { $sum: 1 },
            total: { $sum: "$menuItemsData.price" },
          },
        },
        {
          $project: {
            category: "$_id",
            count: 1,
            total: { $round: ["$total", 2] },
            _id: 0,
          },
        },
      ];

      const result = await paymentCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    // Add this route definition below the existing routes

    // User stats
    app.get("/user-stats", verifyJwt, async (req, res) => {
      try {
        const email = req.decoded.email; // Get the logged-in user's email from the JWT token

        // Fetch total spent by the user
        const userPayments = await paymentCollection.find({ email }).toArray();
        const totalSpent = userPayments.reduce(
          (total, payment) => total + payment.price,
          0
        );

        // Fetch total number of products bought by the user
        const totalProductsBought = userPayments.reduce(
          (total, payment) => total + payment.cartItems.length,
          0
        );

        res.send({
          totalSpent,
          totalProductsBought,
        });
      } catch (error) {
        console.error("Error fetching user stats:", error);
        res
          .status(500)
          .send({ error: true, message: "Error fetching user stats" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("boss");
});

app.listen(port, () => {
  console.log("server is running");
});
